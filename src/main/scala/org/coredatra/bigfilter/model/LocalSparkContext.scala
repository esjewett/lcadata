package org.coredatra.bigfilter
package model

import org.apache.spark.SparkContext
import org.apache.spark.SparkContext._
import org.apache.spark.SparkConf
import org.apache.spark.rdd.RDD

import net.liftmodules.ng.Angular._

import au.com.bytecode.opencsv.CSVParser

object LocalSparkContext {
  val conf = new SparkConf().setAppName("H1-B Filter").setMaster("local")
  val sc = new SparkContext(conf)
  val splitFiles = sc.textFile("data/LCA_FY2013.csv")
    .union(sc.textFile("data/H-1B_FY14_Q4.csv"))
    .union(sc.textFile("data/LCA_FY2012_Q4.csv"))
    .union(sc.textFile("data/H-1B_iCert_LCA_FY2011_Q4.csv"))
    .union(sc.textFile("data/H-1B_FY2010.csv"))
    .map(line => {
      val parser = new CSVParser(',')
      var ret:Seq[String] = Seq()
      try {
        ret = parser.parseLine(line)
      } catch {
        case e: Throwable => println("EXCEPTION: " + e)
      }
      ret
    })
    .filter((s) => s.size > 0)
    .map(line => {
      val amount = line.drop(17).head match {
        case "Year" => (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Month" => 12 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Week" => 50 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        // from http://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/computing-hourly-rates-of-pay-using-the-2087-hour-divisor/
        case "Day" => 261 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case "Hour" => 2087 * (if(line.drop(15).head != "") { line.drop(15).head.toDouble } else { 0 })
        case _ => 0
      }
      line :+ amount.round.toString
    })
    .filter(line => {
        line.drop(17).head != "Select Pay Range" &&
        line.drop(17).head != "" &&
        line.drop(35).head.toDouble < 500000
      })
    
  val data: scala.collection.mutable.Map[Seq[Dimension], RDD[Data]] = scala.collection.mutable.Map()
  
  def dataRDD = {
    // The actual Spark processing is outside of the session context so we need to grab the contents of the
    // SessionVar here.
    val dimensions = ActiveDimension.dimensions.is
  
    splitFiles
      .map(line => ( ActiveDimension.parseFromDimensions(line, dimensions),
              Seq(1, line.drop(35).head.toDouble)
            )
          )
          .aggregateByKey(Seq(0.0,0.0,0.0))( (u,v) => { Seq(u(0)+1, u(1) + v(1), (u(1) + v(1)) / (u(0)+1)) }, 
            (a,b) => { Seq(a(0)+b(0), a(1)+b(1), (a(1)+b(1))/(a(0)+b(0))) } )
          .sortBy({ case (f,c) => f(1) + f(3) + f(2) + f(0) })
          .map({ case (f,c) => Data(f, Seq(c(0).round, ((c(1) / 1000).floor * 1000).round, c(2).round)) })
  }
}

case class Data(keys: Seq[String], values: Seq[Long]) extends NgModel