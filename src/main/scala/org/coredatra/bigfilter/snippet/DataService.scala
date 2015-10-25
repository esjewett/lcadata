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

import org.apache.avro.Schema
import org.apache.avro.Schema.Parser
import org.apache.avro.generic.{GenericData,GenericDatumWriter,GenericDatumReader}
import org.apache.avro.file.DataFileWriter
import org.apache.avro.generic.{GenericRecord,GenericArray,GenericData}
import org.apache.avro.file.CodecFactory
import org.apache.avro.io.{DirectBinaryEncoder,EncoderFactory, BinaryEncoder,DecoderFactory}

import java.io.ByteArrayOutputStream

class DataService {

  def services = renderIfNotAlreadyDefined(angular.module("DataServices").factory("dataService", jsObjFactory()
    .jsonCall("addDimension", (dimension: Dimension) => {
      if(!ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dimension)
      }
      // println(ActiveDimension.dimensions.is.length)
      Full(payloadSchemaString(ActiveDimension.dimensions.is, ActiveDimension.oldDimensions.is))
    })
    .jsonCall("addDimensions", (dimensions: Dimensions) => {
      for(dim <- dimensions.dimensions) {
        if(!ActiveDimension.dimensions.is.contains(dim)) {
          ActiveDimension.dimensions.set(ActiveDimension.dimensions.is :+ dim)
        }
      }
      // println("After: " + ActiveDimension.dimensions.is.length)
      Full(payloadSchemaString(ActiveDimension.dimensions.is, ActiveDimension.oldDimensions.is))
    })
    .jsonCall("removeDimension", (dimension: Dimension) => {
      if(ActiveDimension.dimensions.is.contains(dimension)) {
        ActiveDimension.dimensions.set(ActiveDimension.dimensions.is.filter(
          (dim) => { dim != dimension }
        ))
      }
      // println(ActiveDimension.dimensions.is.length)
      Full(payloadSchemaString(ActiveDimension.dimensions.is, ActiveDimension.oldDimensions.is))
    })
    .jsonCall("getDetail", (filters: Filters) => {
      LocalSparkContext.sc.setLocalProperty("spark.scheduler.pool", "interactive")
      Full(LocalSparkContext.splitFiles.filter( line => {
        val filterResults = for(filter <- filters.filters; round = filter.dimension.round.getOrElse(0)) yield {
          val ret = if(filter.ordinalFilter.length > 0) {
            filter.ordinalFilter.contains(line.drop(filter.dimension.column - 1).head)
          } else {
            if(filter.rangeFilter.length == 2) {
              if(round > 0 && line.drop(filter.dimension.column - 1).head != "" ) {
                // Rounding so assume numeric
        				val num = ((line.drop(filter.dimension.column - 1).head.toFloat / round).floor * round).toInt
                // Range only goes to 10000 (special case - should be parameterized)
                val bot = if(filter.rangeFilter(0).toFloat < 10001) { 0.0 } else { filter.rangeFilter(0).toFloat }
                // Range only goes to 500000 (special case - should be parameterized)
                val top = if(filter.rangeFilter(1).toFloat > 500000) { 999999999999999999.0 } else { filter.rangeFilter(1).toFloat }
                val intRet = ( bot <= num && num < top )
                intRet
        			} else {
                // No rounding, so assume text (shouldn't happen)
        				val strRet = ( filter.rangeFilter(0) <= line.drop(filter.dimension.column - 1).head && line.drop(filter.dimension.column - 1).head  < filter.rangeFilter(1) )
                strRet
        			}
            } else {
              true
            }
          }
          ret
        }
        
        filterResults.indexOf(false) == -1
      }).take(15));
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
            (sess) => sess.sendCometActorMessage("DataActor", Empty, ("addData", avroSerialize(payload, newDimensions, oldDimensions, newIteration, oldIteration)))
          )
          payload = ArrayBuffer()
        }
      }  
      
      S.session.foreach(
        (sess) => {
          sess.sendCometActorMessage("DataActor", Empty, ("addData", avroSerialize(payload, newDimensions, oldDimensions, newIteration, oldIteration)))
        }
      )
      
      S.session.foreach(
        (sess) => sess.sendCometActorMessage("DataActor", Empty, ("endAdd", Empty))
      )
      
      payload = ArrayBuffer() 
 
      Empty
    })
  ))

  def rowSchemaJson = (newDimensions: Seq[Dimension], oldDimensions: Seq[Dimension]) => {
    JObject(
      List(
        JField("type", JString("record")),
        JField("name", JString("TransferRecord")),
        JField("fields", JArray(
          (for(dim:Dimension <- newDimensions.union(oldDimensions).toSet) yield {
            JObject(List(JField("name", JString(dim.key)), JField("type", JString("string")), JField("default", JString(""))))
          }).toList.union(List(JObject(List(JField("name", JString("i")), JField("type", JString("string"))))))
            .union(List(
              JObject(List(JField("name", JString("count")), JField("type", JString("string")))),
              JObject(List(JField("name", JString("sum")), JField("type", JString("string")))),
              JObject(List(JField("name", JString("avg")), JField("type", JString("string"))))
            ))
        ))
      )
    )
  }

  def rowSchema = (newDimensions: Seq[Dimension], oldDimensions: Seq[Dimension]) => {
    val rowSchemaObj = rowSchemaJson(newDimensions, oldDimensions)

    val rowSchemaString = Schema.parse(Printer.compact(JsonAST.render(rowSchemaObj)))
    rowSchemaString
  }

  def payloadSchemaString = (newDimensions: Seq[Dimension], oldDimensions: Seq[Dimension]) => {
    Printer.compact(JsonAST.render(JObject(
      List(
        JField("type", JString("array")),
        JField("items", rowSchemaJson(newDimensions, oldDimensions))
      )
    )))
  }

  def payloadSchema = (newDimensions: Seq[Dimension], oldDimensions: Seq[Dimension]) => {
    val payloadSchema = Schema.parse(payloadSchemaString(newDimensions, oldDimensions))

    payloadSchema
  }

  def avroSerialize = (payload: ArrayBuffer[Data], newDimensions: Seq[Dimension], oldDimensions: Seq[Dimension], newIteration: String, oldIteration: String) => {
    val rowSchemaObj = rowSchemaJson(newDimensions, oldDimensions)

    val rowSchemaString = Schema.parse(Printer.compact(JsonAST.render(rowSchemaObj)))

    val payloadSchemaString = payloadSchema(newDimensions, oldDimensions)

    val os = new ByteArrayOutputStream()
    val factory = new EncoderFactory().configureBlockSize(100000)
    val enc = factory.blockingBinaryEncoder(os, null)
    val datumWriter = new GenericDatumWriter[GenericArray[GenericRecord]](payloadSchemaString)

    val plRecords = new GenericData.Array[GenericRecord](100000, payloadSchemaString)

    val plList = for(row <- payload) {
      val rec = new GenericData.Record(rowSchemaString);
      row.newRec match {
        case true => {
            for((dim, idx) <- newDimensions.zipWithIndex) {
              if(row.keys(idx) != null) {
                rec.put(dim.key, row.keys(idx))
              } else {
                rec.put(dim.key, "")
              }
            }
            rec.put("i", newIteration)
            // Get the elements not in this set
            for(dim <- oldDimensions.toSet.diff(newDimensions.toSet)){
              rec.put(dim.key, "")
            }
          }
        case false => {
            for((dim, idx) <- oldDimensions.zipWithIndex) {
              if(row.keys(idx) != null) {
                rec.put(dim.key, row.keys(idx))
              } else {
                rec.put(dim.key, "")
              }
            }
            rec.put("i", oldIteration)
            // Get the elements not in this set
            for(dim <- newDimensions.toSet.diff(oldDimensions.toSet)){
              rec.put(dim.key, "")
            }
          }
      }
      
      rec.put("count", row.values(0).toString)
      rec.put("sum", row.values(1).toString)
      rec.put("avg", row.values(2).toString)
      
      plRecords.add(rec)
    }

    datumWriter.write(plRecords, enc)
    os.flush()
    os.close()

    os.toByteArray
  }
}