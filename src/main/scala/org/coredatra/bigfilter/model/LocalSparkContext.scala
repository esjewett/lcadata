package org.coredatra.bigfilter
package model

import org.apache.spark.SparkContext
import org.apache.spark.SparkContext._
import org.apache.spark.SparkConf
import org.apache.spark.rdd.RDD
import org.apache.spark.storage.StorageLevel

import net.liftweb.http.LiftRules

import net.liftmodules.ng.Angular._

import au.com.bytecode.opencsv.CSVParser

object LocalSparkContext {
  val conf = new SparkConf()
    .setAppName("LCA Filter")
    .setMaster("local[4]")
    .set("spark.executor.extraJavaOptions", "-XX:+UseCompressedOops")
    .set("spark.executor.memory", "4g")
    .set("spark.scheduler.mode", "FAIR")
    .set("spark.shuffle.consolidateFiles", "true")
    
  // This is a freaking mess. LiftRules.getResource appears to return the
  // correct path, but Spark throws a file not found exception and everything
  // blows up. For the moment just putting the config file with the data :-/
  for(url <- LiftRules.getResource("/fairscheduler.xml")) {
    println("Loading fair scheduler config from: " + url)
    // conf.set("spark.scheduler.allocation.file", url.toString)
  }
  conf.set("spark.scheduler.allocation.file", "/data/lca/fairscheduler.xml")
    
  val sc = new SparkContext(conf)
  val splitFiles = sc.textFile("/data/lca/LCA_FY2013.csv")
    .union(sc.textFile("/data/lca/H-1B_FY14_Q4.csv"))
    .union(sc.textFile("/data/lca/H-1B_FY2015_Q3.csv"))
    .union(sc.textFile("/data/lca/LCA_FY2012_Q4.csv"))
    .union(sc.textFile("/data/lca/H-1B_iCert_LCA_FY2011_Q4.csv"))
    .union(sc.textFile("/data/lca/H-1B_FY2010.csv"))
    .map(line => {
      val parser = new CSVParser(',')
      var ret:Seq[String] = Seq()
      try {
        ret = parser.parseLine(line)
      } catch {
        // case e: Throwable => println("EXCEPTION: " + e)
        case e: Throwable => { }
      }
      ret
    })
    .filter((s) => s.size > 0) // Contains data
    .filter((s) => !s.drop(15).head.contains('-')) // Exclude range formatted wage (1 record...)
    .map(line => {
      val amount = line.drop(17).head match {
        case "Year" => (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Month" => 12 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Week" => 50 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Bi-Weekly" => 100 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        // from http://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/computing-hourly-rates-of-pay-using-the-2087-hour-divisor/
        case "Day" => 261 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Hour" => 2087 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case _ => 0
      }
      val date = line.drop(2).head
      val year = date.slice(date.length - 2, date.length)
      line :+ amount.round.toString :+ year
    })
    .filter(line => {
        line.drop(17).head != "Select Pay Range" &&
        line.drop(17).head != "" &&
        line.drop(35).head != "0"
      })
    .map(line => line.toArray)
      
  splitFiles.persist(StorageLevel.MEMORY_ONLY_SER)
    
  val data: scala.collection.mutable.Map[Seq[Dimension], RDD[Data]] = scala.collection.mutable.Map()
  val diff: scala.collection.mutable.Map[Diff, RDD[Data]] = scala.collection.mutable.Map()
  
  def dataRDD = (dimensions:Seq[Dimension]) => {
  
    println("Generating: " + dimensions)
    println("With pool:" + sc.getLocalProperty("spark.scheduler.pool"))
  
    splitFiles
      .map(line => ( ActiveDimension.parseFromDimensions(line, dimensions),
              Seq(1, line.drop(35).head.toDouble)
            )
          )
          .aggregateByKey(Seq(0.0,0.0,0.0))( (u,v) => { Seq(u(0)+1, u(1) + v(1), (u(1) + v(1)) / (u(0)+1)) }, 
            (a,b) => { Seq(a(0)+b(0), a(1)+b(1), (a(1)+b(1))/(a(0)+b(0))) } )
          .sortBy({ case (f,c) => f.mkString })
          .map({ case (f,c) => Data(f, Seq(c(0).round, ((c(1) / 1000).floor * 1000).round, c(2).round), true) })
  }
}

case class Data(keys: Seq[String], values: Seq[Long], newRec: Boolean) extends NgModel
case class Diff(oldDimensions: Seq[Dimension], newDimensions: Seq[Dimension])