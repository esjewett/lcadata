package org.coredatra.bigfilter
package workers

import net.liftweb.actor.LiftActor

import net.liftweb.util.Schedule
import org.coredatra.bigfilter.model._

object CacheActor extends LiftActor { self =>
  
  override protected def messageHandler = {
    case ("preRegister", dimensions: Dimensions) => {
      val dimCombos = dimensions.dimensions.toSet.subsets(1) ++
        dimensions.dimensions.toSet.subsets(2) ++
        dimensions.dimensions.toSet.subsets(3) ++
        dimensions.dimensions.toSet.subsets(4)
        
      LocalSparkContext.sc.setLocalProperty("spark.scheduler.pool", "lowPriority")
      
      // Prepopulate RDD map
      for(set <- dimCombos) {
        LocalSparkContext.data.getOrElseUpdate(set.toList, LocalSparkContext.dataRDD(set.toList))
      }
    }
  }
}