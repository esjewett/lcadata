package org.coredatra.bigfilter
package comet

import net.liftmodules.ng._
import net.liftweb.util.Schedule
import java.util.Date



class DataActor extends AngularActor { self =>
  
  override def lowPriority = {
    case ("addData", obj:AnyRef) => scope.broadcast("addData", obj) 
    case ("beginAdd", obj:AnyRef) => scope.broadcast("beginAdd", obj)
    case ("endAdd", obj:AnyRef) => scope.broadcast("endAdd", obj)
  }
}