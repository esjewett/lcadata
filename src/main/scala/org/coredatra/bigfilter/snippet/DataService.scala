package org.coredatra.bigfilter
package snippet

import scala.xml.{NodeSeq, Text}
import net.liftweb.util._
import net.liftweb.common._
import net.liftweb.http.S
import net.liftmodules.ng.Angular._
import java.util.Date
import net.liftweb.json._
import Helpers._

import model._

import scala.collection.mutable.ArrayBuffer
import scala.collection.mutable.Map

import org.coredatra.bigfilter.model.Data
import org.coredatra.bigfilter.model.Diff

class DataService {

  def services = renderIfNotAlreadyDefined(angular.module("DataServices").factory("dataService", jsObjFactory()
    .jsonCall("addDimension", (dimension: Dimension) => {
      if(!ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dimension)
      }
      // println(ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("addDimensions", (dimensions: Dimensions) => {
      for(dim <- dimensions.dimensions) {
        if(!ActiveDimension.dimensions.is.contains(dim)) {
          ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dim)
        }
      }
      // println("After: " + ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("removeDimension", (dimension: Dimension) => {
      if(ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is.filter(
          (dim) => { dim != dimension }
        ))
      }
      // println(ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("load", {
    
      LocalSparkContext.sc.setLocalProperty("spark.scheduler.pool", "interactive")
    
      val newDimensions = ActiveDimension.dimensions.is
      val oldIteration = (ActiveDimension.iteration.is + 1).toString
      ActiveDimension.iteration(ActiveDimension.iteration.is + 2)
      val oldDimensions = ActiveDimension.oldDimensions.is
      val newIteration = ActiveDimension.iteration.is.toString
      ActiveDimension.oldDimensions(newDimensions)
    
      lazy val oldRdd = LocalSparkContext.data.getOrElse(oldDimensions, LocalSparkContext.dataRDD(oldDimensions))
      // println("Active dimensions in load: " + newDimensions.length)
      val newRdd = LocalSparkContext.data.getOrElseUpdate(newDimensions, LocalSparkContext.dataRDD(newDimensions))
      val diff = Diff(oldDimensions, newDimensions)

      // println("Old context count: " + oldRdd.count())
      // println("Old iteration: " + oldIteration) 
      // println("New context count: " + newRdd.count())
      // println("New iteration: " + newIteration)
      
      val combinedRdd = if(oldIteration != "1") {
        LocalSparkContext.diff.getOrElseUpdate(diff, oldRdd.map((data) => {
            Data(data.keys, data.values.map((v) => { v * -1 }), false)
          }).union(newRdd).sortBy((d) => d.keys.mkString))
      } else {
        newRdd
      }
      
      // println("Combined context count: " + combinedRdd.count())
      
      val iter = combinedRdd.toLocalIterator
    
      var payload: ArrayBuffer[Data] = ArrayBuffer()
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("beginAdd", Empty))
      )
      
      for(data <- iter) {
        payload += data
          
        if(payload.length > 99999) {
          S.session.foreach(
            (sess) => sess.sendCometActorMessage("DataActor", Empty, ("addData", compress(payload, newDimensions, oldDimensions, newIteration, oldIteration)))
          )
          payload = ArrayBuffer()
        }
      }  
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("addData", compress(payload, newDimensions, oldDimensions, newIteration, oldIteration)))
      )
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("endAdd", Empty))
      )
      
      payload = ArrayBuffer() 
 
      Empty
    })
  ))
  
  def compress = (payload: ArrayBuffer[Data], currentStructure: Seq[Dimension], previousStructure: Seq[Dimension], ci: String, oi: String) => {
    val compressedPayload: Map[String, Map[String, ArrayBuffer[String]]] = Map()
    
    def intToStr = (int: Int) => {
      java.lang.Integer.toString(int, 36)
    }
    
    def strToInt = (str: String) => {
      java.lang.Integer.parseInt(str, 36)
    }
    
    def appendCompressed = (key: String, member: String, rowNum: Int) => {
      val map = compressedPayload.getOrElse(key, Map())
      val list = map.getOrElse(member, ArrayBuffer()) += intToStr(rowNum)
      
      // Check the list actually has 2 items
      if(list.length > 1) {
        // Check if the last 2 elements are adjacent.
        if(list(list.length - 2).contains(":")) {
        	// The previous item is a range.
          if(strToInt(list(list.length-2).split(":")(1)) + strToInt(list(list.length-2).split(":")(0)) == rowNum) {
            // We should add this to the previous range because the start line plus the length is the previous row.
            list.update(list.length-2, list(list.length-2).split(":")(0) + ":" + intToStr(strToInt(list(list.length-2).split(":")(1)) + 1))
            list.remove(list.length-1)
          }
        } else {
          // Previous item is not a range
          if(strToInt(list(list.length - 2)) == rowNum-1) {
            // We should start a range.
            list.update(list.length-2, list(list.length-2) + ":" + intToStr(2))
            list.remove(list.length-1) 
          }  
        }
      }
      
      map.update(member, list)
      compressedPayload.update(key, map)
    }
    
    for((data, i) <- payload.zipWithIndex) {
      data.newRec match {
        case true => {
            for((dim, idx) <- currentStructure.zipWithIndex) {
              appendCompressed(dim.key, data.keys(idx), i)
            }
            appendCompressed("i", ci, i)
          }
        case false => {
            for((dim, idx) <- previousStructure.zipWithIndex) {
              appendCompressed(dim.key, data.keys(idx), i)
            }
            appendCompressed("i", oi, i)
          }
      }
      
      appendCompressed("count", data.values(0).toString, i)
      appendCompressed("sum", data.values(1).toString, i)
      appendCompressed("avg", data.values(2).toString, i)
    }

    val finalPayload = for((key, value) <- compressedPayload) yield {
      val map: Map[String, String] = Map()
      val fieldList = for((member, arr) <- value) yield {
        map.update(member, arr.mkString(","))
        JField(member, JString(arr.mkString(",")))
      }
      JField(key, JObject(fieldList.toList))
    }
    
    JObject(finalPayload.toList)
  }
}