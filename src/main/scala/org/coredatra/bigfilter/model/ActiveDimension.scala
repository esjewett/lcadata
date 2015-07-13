package org.coredatra.bigfilter
package model

import net.liftmodules.ng.Angular.NgModel
import net.liftweb.common.Box
import net.liftweb.http.RequestVar

object ActiveDimension {
	
	// var dimensions: Seq[Dimension] = Seq()
	val emptyDim: Seq[Dimension] = Seq()
	object dimensions extends RequestVar(emptyDim)
	object oldDimensions extends RequestVar(emptyDim)
	object iteration extends RequestVar(0)
	
	def parseFromDimensions(line: Seq[String], dimensions: Seq[Dimension]) = {
		for(dim <- dimensions; round = dim.round.getOrElse(0)) yield {
		    if(round > 0 && line.drop(dim.column - 1).head != "" ) {
				((line.drop(dim.column - 1).head.toFloat / round).floor * round).toInt.toString
			} else {
				line.drop(dim.column - 1).head
			}
		}
	}
}

case class Dimension(key: String, column: Int, round: Option[Int]) extends NgModel
case class Dimensions(dimensions: List[Dimension]) extends NgModel