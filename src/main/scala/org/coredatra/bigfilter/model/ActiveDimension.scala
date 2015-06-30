package org.coredatra.bigfilter
package model

import net.liftmodules.ng.Angular.NgModel
import net.liftweb.common.Box
import net.liftweb.http.SessionVar

object ActiveDimension {
	
	// var dimensions: Seq[Dimension] = Seq()
	val emptyDim: Seq[Dimension] = Seq()
	object dimensions extends SessionVar(emptyDim)
	
	def parseFromDimensions(line: Seq[String], dimensions: Seq[Dimension]) = {
		for(dim <- dimensions; round = dim.round.getOrElse(0)) yield {
		    if(round > 0 && line.drop(dim.column - 1).head != "" ) {
				((line.drop(dim.column - 1).head.toFloat / round).floor * round).toInt.toString
			} else {
				line.drop(dim.column - 1).head
			}
		}
	}
	
	var currentIteration: Int = 0

}

case class Dimension(key: String, column: Int, round: Option[Int]) extends NgModel