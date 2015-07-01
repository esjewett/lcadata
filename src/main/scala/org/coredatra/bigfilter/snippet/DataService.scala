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

case class Dimensions(dimensions: List[Dimension]) extends NgModel

class DataService {

  def services = renderIfNotAlreadyDefined(angular.module("DataServices").factory("dataService", jsObjFactory()
    .jsonCall("addDimension", (dimension: Dimension) => {
      if(!ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.currentIteration += 1
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dimension)
      }
      println(ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("addDimensions", (dimensions: Dimensions) => {
      ActiveDimension.currentIteration += 1
      for(dim <- dimensions.dimensions) {
        if(!ActiveDimension.dimensions.is.contains(dim)) {
          ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dim)
        }
      }
      println("After: " + ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("removeDimension", (dimension: Dimension) => {
      if(ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.currentIteration += 1
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is.filter(
          (dim) => { dim != dimension }
        ))
      }
      println(ActiveDimension.dimensions.is.length)
      Empty
    })
    .jsonCall("load", {
    
      val oldRdd = LocalSparkContext.data.getOrElse(ActiveDimension.oldDimensions.is, LocalSparkContext.dataRDD(ActiveDimension.oldDimensions.is))
      println("Active dimensions in load: " + ActiveDimension.dimensions.is.length)
      val newRdd = LocalSparkContext.data.getOrElseUpdate(ActiveDimension.dimensions.is, LocalSparkContext.dataRDD(ActiveDimension.dimensions.is))
    
      println("Old context count: " + oldRdd.count())  
      println("New context count: " + newRdd.count())
      
      val combinedRdd = if(ActiveDimension.oldDimensions.is.length > 0) {
        oldRdd.map((data) => {
          Data(data.keys, data.values.map((v) => { v * -1 }), false)
        }).union(newRdd).sortBy((d) => d.keys.mkString)
      } else {
        newRdd
      }
      
      println("Combined context count: " + combinedRdd.count())
      
      val iter = combinedRdd.toLocalIterator
    
      var payload: ArrayBuffer[Data] = ArrayBuffer()
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("beginAdd", Empty))
      )
      
      for(data <- iter) {
        payload += data
          
        if(payload.length > 99999) {
          S.session.foreach(
            (sess) => sess.sendCometActorMessage("DataActor", Empty, ("addData", compress(payload)))
          )
          payload = ArrayBuffer()
        }
      }  
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("addData", compress(payload)))
      )
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("endAdd", Empty))
      )
      
      payload = ArrayBuffer()
      ActiveDimension.oldDimensions(ActiveDimension.dimensions.is) 
 
      Empty
    })
  ))
  
  def compress = (payload: ArrayBuffer[Data]) => {
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
        case true => for((dim, idx) <- ActiveDimension.dimensions.is.zipWithIndex) {
                        appendCompressed(dim.key, data.keys(idx), i)
                      }
        case false => for((dim, idx) <- ActiveDimension.oldDimensions.is.zipWithIndex) {
                        appendCompressed(dim.key, data.keys(idx), i)
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