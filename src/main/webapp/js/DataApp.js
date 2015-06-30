angular.module('DataApp', ['DataServices']).

controller('Data', ['$scope', 'dataService', function($scope, dataService) {
  var ordinalReducer = reductio();
  ordinalReducer.value("aggCount").sum('count');
  ordinalReducer.value("aggSalary").sum('sum');
  ordinalReducer.alias({ aggAvg: function(g) { return g.aggSalary.sum/g.aggCount.sum; } });
  
  // Create the crossfilter for the relevant dimensions and groups.
  var visas = crossfilter(),
      all = visas.groupAll(),
//      date = flight.dimension(function(d) { return parseDate(d.date); }),
//      date = visas.dimension(function(d) { return d.date; }),
//      dates = date.group(d3.time.day),
//      dates = date.group(d3.time.week),
      status = visas.dimension(function(d) { return d.status; }),
      statuses = status.group(),
//      visaClass = visas.dimension(function(d) { return d.visa_class; }),
//      visaClasses = visaClass.group(),
      wageUnit = visas.dimension(function(d) { return d.wage_unit; }),
      wageUnits = wageUnit.group(),
      wage = visas.dimension(function(d) { return +d.wage_from; }),
      wages = wage.group().reduceSum(function(d) { return d.count; }),
//      fullTime = visas.dimension(function(d) { return d.full_time; }),
//      fullTimes = fullTime.group(),
      numberDisplay, dateChart, stateChart, wageHistogram, employmentState, employmentStates,
      jobTitle, jobTitles, jobChart;
      
//  reducer(dates);
  ordinalReducer(statuses);
//  reducer(visaClasses);
  ordinalReducer(wageUnits);
//  reducer(fullTimes);
  reductio()
    .groupAll(function() { return [""]; })
    .sum('count')(all);
  
  // Setup
  dataService.addDimensions({
    dimensions: [
//        {key: "date", column: 3 },
      {key: "status", column: 2 },
//        {key: "visa_class", column: 5},
      {key: "wage_unit", column: 18 },
      {key: "wage_from", column: 16, round: 10000 }
//        {key: "full_time", column: 19},
    ]
  });
  
  $scope.$on('endAdd', function(e) {
    $('#loading-indicator').removeClass('active');
  });
  
  $scope.$on('beginAdd', function(e) {
    $('#loading-indicator').addClass('active');
  });
  
  $scope.$on('addData', function(e, obj) {
    
    console.log(JSON.stringify(obj).length);
    console.log(obj);
        
    var newObj = [];
    var valRanges, parsedLength, parsedStart;
    var split = function(r) { return r.split(':').map(parse); };
    var parse = function(s) { return parseInt(s, 36); };
    
    for(var prop in obj) {
      for(var member in obj[prop]) {
        valRanges = obj[prop][member].split(',').map(split);
        for (var i = 0; i < valRanges.length; i++) {
          if(valRanges[i].length === 1) {
            // No range, so make it a range with lengh of 1.
            valRanges[i].push(1);
          }
          for (var j = 0; j < valRanges[i][1]; j++) {
            while(newObj.length <= valRanges[i][0] + j) {
              newObj.push({});
            }

            newObj[valRanges[i][0] + j][prop] = member;
          }
        }
      }
    }
    
    newObj.forEach(function(d, i) {
//      d.date = parseDate(d.date);
      d.count = +d.count;
    });
    
    visas.add(newObj);
    
    if(stateChart) stateChart.calculateColorDomain();
    if(jobChart) jobChart.calculateColorDomain();
    if(wageHistogram) wageHistogram.x(d3.scale.linear().domain([0, +(wage.top(1)[0] ? wage.top(1)[0].wage_from : 100000) ]));
    
    dc.redrawAll();
//    dc.renderAll();
  });
  
  $scope.showState = false;
  $scope.initState = function() {
    
    var promise = dataService.addDimension({key: "employment_state", column: 11 });
    employmentState = visas.dimension(function(d) { return d.employment_state; });
    employmentStates = employmentState.group();
    ordinalReducer(employmentStates);
    
    d3.json("../geo/us-states.json", function (statesJson) {
      var colorScale = d3.scale.quantize().range(["#E2F2FF", "#C4E4FF", "#9ED2FF", "#81C5FF", "#6BBAFF", "#51AEFF", "#36A2FF", "#1E96FF", "#0089FF", "#0061B5"]);
      
      $scope.$apply(function(s) { s.showState = true; });
      
      stateChart = dc.geoChoroplethChart('#state-chart')
        .width(990)
        .height(500)
        .dimension(employmentState)
        .group(employmentStates)
  //      .colorAccessor(function(d) { return d.value.aggAvg && d.value.aggAvg() ? d.value.aggAvg() : 0; })
        .colorAccessor(function(d) { return d.value.aggCount.sum; })
        .colors(colorScale)
        .calculateColorDomain()
  //      .colorCalculator(function (d) { return d ? colorScale(d.aggAvg && d.aggAvg() ? d.aggAvg() : 0) : '#ccc'; })
        .colorCalculator(function (d) { return d ? colorScale(d.aggCount.sum) : '#ccc'; })
        .overlayGeoJson(statesJson.features, "state", function (d) {
            return d.properties.name;
        })
        .title(function (d) {
  //          return "State: " + d.key + "\nAverage Salary: " + formatNumber(d.aggAvg && d.aggAvg() ? d.aggAvg() : 0);
              return "State: " + d.key + "\nTotal applications: " + formatNumber(d.aggCount && d.aggCount.sum);
        });
      stateChart.render();
    });
    
    promise.then(dataService.load);
  }
  
  $scope.showJob = false;
  $scope.initJob = function () {
    $scope.showJob = true;
    
    var promise = dataService.addDimension({key: "job_title", column: 15 });
    jobTitle = visas.dimension(function(d) { return d.job_title; });
    jobTitles = jobTitle.group();
    ordinalReducer(jobTitles);
    jobTitles.order(function(d) { return d.aggCount.sum; });
    
    jobChart = dc.bubbleChart('#job-chart')
      .width(990)
      .height(500)
      .dimension(jobTitle)
      .group(jobTitles)
      .colorAccessor(function(d) { return d.value.aggCount.sum; })
      .keyAccessor(function(d) { return d.value.aggCount.sum; })
      .valueAccessor(function(d) { return d.value.aggAvg(); })
      .radiusValueAccessor(function(d) { return d.value.aggAvg(); })
      .x(d3.scale.log().domain([0, jobTitles.top(1)[0] ? jobTitles.top(1)[0] : 1 ]))
      .maxBubbleRelativeSize(0.05)
      .yAxisPadding(10000)
      .elasticY(true)
      .elasticX(true)
      .elasticRadius(true)
      .renderHorizontalGridLines(true)
      .renderVerticalGridLines(true)
      .xAxisLabel("Count")
      .yAxisLabel("Average Salary")
      .renderLabel(true)
      .data(function(group) { return group.top(30); })
      .label(function(d) { return d.key; });
      
    jobChart.render();
    
    promise.then(dataService.load);
    console.log(jobTitle);
    console.log(jobTitles);
  }
  
  // Code from Crossfilter example website.
  
  // Various formatters.
  var formatNumber = d3.format(",d"),
      formatChange = d3.format("+,d"),
      formatDate = d3.time.format("%B %d, %Y"),
      formatTime = d3.time.format("%I:%M %p");
      
  // Setup charts
  numberDisplay = dc.dataCount("#totals")
    .dimension({ size: function() { return 0; } })
    .group({ value: function() { return all.value()[0] ? all.value()[0].value.sum : 0; }})
    .html({
      some: '%filter-count out of %total-count applications displayed',
      all: 'All %total-count applications displayed'
    });
    
  // Disable transitions for real interactive filtering
  dc.disableTransitions = true;
    
  wageHistogram = dc.barChart('#wage-histogram-chart')
    .height(150)
    .margins({top: 20, right: 10, bottom: 20, left: 50})
    .dimension(wage)
    .group(wages)
    .centerBar(true)
    .gap(1)
    .x(d3.scale.linear().domain([0, +(wage.top(1)[0] ? wage.top(1)[0].wage_from : 100000)]))
    .elasticY(true)
    .elasticX(true);
    
  dc.rowChart('#status-chart')
    .height(180)
    .margins({top: 20, left: 10, right: 10, bottom: 20})
    .group(statuses)
    .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
    .dimension(status)
    .ordinalColors(['#3182bd', '#6baed6', '#9ecae1', '#c6dbef', '#dadaeb'])
    .elasticX(true);

  dc.rowChart('#wage-unit-chart')
    .height(180)
    .margins({top: 20, left: 10, right: 10, bottom: 20})
    .group(wageUnits)
    .dimension(wageUnit)
    .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
    .ordinalColors(['#3182bd', '#6baed6', '#9ecae1', '#c6dbef', '#dadaeb'])
    .elasticX(true);
    
  dc.renderAll();
  dataService.load();
    
//  dc.pieChart('#full-time-chart')
//    .width(180)
//    .height(180)
//    .radius(80)
//    .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
//    .dimension(fullTime)
//    .group(fullTimes);

//  dc.rowChart('#class-chart')
//    .height(180)
//    .margins({top: 20, left: 10, right: 10, bottom: 20})
//    .group(visaClasses)
//    .dimension(visaClass)
//    .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
//    .ordinalColors(['#3182bd', '#6baed6', '#9ecae1', '#c6dbef', '#dadaeb'])
//    .elasticX(true);

//  dateChart = dc.barChart('#date-chart')
//    .width(990)
//    .height(150)
//    .margins({top: 0, right: 50, bottom: 20, left: 40})
//    .dimension(date)
//    .group(dates)
//    .centerBar(true)
//    .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
//    .gap(1)
//    .x(d3.time.scale().domain([new Date(2009, 0, 1), new Date(2014, 11, 31)]))
//    .elasticY(true)
//    .round(d3.time.day.round)
//    .alwaysUseRounding(true)
//    .xUnits(d3.time.day);
      
//  var charts = [
//    barChart()
//        .dimension(status)
//        .group(statuses)
//      .x(d3.scale.ordinal()
////        .domain(["CERTIFIED", "CERTIFIED-WITHDRAWN"])
//        .domain(["CERTIFIED", "CERTIFIED-WITHDRAWN", "DENIED", "INVALIDATED", "REJECTED", "WITHDRAWN"])
//        .rangePoints([0, 10 * 24])),
////    barChart()
////        .dimension(visaClass)
////        .group(visaClasses)
////      .x(d3.scale.linear()
////        .domain([-60, 150])
////        .rangeRound([0, 10 * 21])),
////    barChart()
////        .dimension(distance)
////        .group(distances)
////      .x(d3.scale.linear()
////        .domain([0, 2000])
////        .rangeRound([0, 10 * 40])),
//    barChart()
//        .dimension(date)
//        .group(dates)
//        .round(d3.time.day.round)
////        .barWidth(13)
//        .barWidth(3)
//      .x(d3.time.scale()
////        .domain([new Date(2014, 0, -2), new Date(2014, 11, 35)])
//        .domain([new Date(2013, 0, 1), new Date(2014, 11, 32)])
//        .rangeRound([0, 3*365]))
////        .rangeRound([0,13*53]))
//        .filter([new Date(2014, 1, 1), new Date(2014, 2, 1)])
//  ];
  
  // Given our array of charts, which we assume are in the same order as the
  // .chart elements in the DOM, bind the charts to the DOM and render them.
  // We also listen to the chart's brush events to update the display.
//  var chart = d3.selectAll(".chart")
//      .data(charts)
//      .each(function(chart) { chart.on("brush", renderAll).on("brushend", renderAll); });
      
  // Render the initial lists.
//  var list = d3.selectAll(".list")
//      .data([flightList]);
      
  // Render the total.
//  d3.selectAll("#total")
//      .text(formatNumber(visas.size()));
//  renderAll();
  
  // Renders the specified chart or list.
//  function render(method) {
//    d3.select(this).call(method);
//  }
  
  // Whenever the brush moves, re-rendering everything.
//  function renderAll() {
//    chart.each(render);
////    list.each(render);
//    d3.select("#active").text(formatNumber(all.value()));
//    d3.selectAll("#total").text(formatNumber(visas.size()));
//  }
  
  // Like d3.time.format, but faster.
  function parseDate(d) {
    return new Date("20" + d.split('/')[2],
        d.split('/')[0] - 1,
        d.split('/')[1]);
  }
//  window.filter = function(filters) {
//    filters.forEach(function(d, i) { charts[i].filter(d); });
//    renderAll();
//  };
//  window.reset = function(i) {
//    charts[i].filter(null);
//    renderAll();
//  };
//  function flightList(div) {
//    var flightsByDate = nestByDate.entries(date.top(40));
//    div.each(function() {
//      var date = d3.select(this).selectAll(".date")
//          .data(flightsByDate, function(d) { return d.key; });
//      date.enter().append("div")
//          .attr("class", "date")
//        .append("div")
//          .attr("class", "day")
//          .text(function(d) { return formatDate(d.values[0].date); });
//      date.exit().remove();
//      var flight = date.order().selectAll(".flight")
//          .data(function(d) { return d.values; }, function(d) { return d.index; });
//      var flightEnter = flight.enter().append("div")
//          .attr("class", "flight");
//      flightEnter.append("div")
//          .attr("class", "time")
//          .text(function(d) { return formatTime(d.date); });
//      flightEnter.append("div")
//          .attr("class", "origin")
//          .text(function(d) { return d.origin; });
//      flightEnter.append("div")
//          .attr("class", "destination")
//          .text(function(d) { return d.destination; });
//      flightEnter.append("div")
//          .attr("class", "distance")
//          .text(function(d) { return formatNumber(d.distance) + " mi."; });
//      flightEnter.append("div")
//          .attr("class", "delay")
//          .classed("early", function(d) { return d.delay < 0; })
//          .text(function(d) { return formatChange(d.delay) + " min."; });
//      flight.exit().remove();
//      flight.order();
//    });
//  }
//  function barChart() {
//    if (!barChart.id) barChart.id = 0;
//    var margin = {top: 10, right: 10, bottom: 20, left: 10},
//        x,
//        y = d3.scale.linear().range([100, 0]),
//        barWidth = 9,
//        id = barChart.id++,
//        axis = d3.svg.axis().orient("bottom"),
//        brush = d3.svg.brush(),
//        brushDirty,
//        dimension,
//        group,
//        round;
//    function chart(div) {
//      var width = x.range()[x.range().length - 1],
//          height = y.range()[0];
//      y.domain([0, group.top(1)[0] ? group.top(1)[0].value : 0]);
//      div.each(function() {
//        var div = d3.select(this),
//            g = div.select("g");
//        // Create the skeletal chart.
//        if (g.empty()) {
//          div.select(".title").append("a")
//              .attr("href", "javascript:reset(" + id + ")")
//              .attr("class", "reset")
//              .text("reset")
//              .style("display", "none");
//          g = div.append("svg")
//              .attr("width", width + margin.left + margin.right)
//              .attr("height", height + margin.top + margin.bottom)
//            .append("g")
//              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
//          g.append("clipPath")
//              .attr("id", "clip-" + id)
//            .append("rect")
//              .attr("width", width)
//              .attr("height", height);
//          g.selectAll(".bar")
//              .data(["background", "foreground"])
//            .enter().append("path")
//              .attr("class", function(d) { return d + " bar"; })
//              .datum(group.all());
//          g.selectAll(".foreground.bar")
//              .attr("clip-path", "url(#clip-" + id + ")");
//          g.append("g")
//              .attr("class", "axis")
//              .attr("transform", "translate(0," + height + ")")
//              .call(axis);
//          // Initialize the brush component with pretty resize handles.
//          var gBrush = g.append("g").attr("class", "brush").call(brush);
//          gBrush.selectAll("rect").attr("height", height);
//          gBrush.selectAll(".resize").append("path").attr("d", resizePath);
//        }
//        
//        // Set the data again
//        g.selectAll(".bar")
//          .each(function() {
//            d3.select(this).datum(group.all());
//          });
//        
//        // Only redraw the brush if set externally.
//        if (brushDirty) {
//          brushDirty = false;
//          g.selectAll(".brush").call(brush);
//          div.select(".title a").style("display", brush.empty() ? "none" : null);
//          if (brush.empty()) {
//            g.selectAll("#clip-" + id + " rect")
//                .attr("x", 0)
//                .attr("width", width);
//          } else {
//            var extent = brush.extent();
//            g.selectAll("#clip-" + id + " rect")
//                .attr("x", x(extent[0]))
//                .attr("width", x(extent[1]) - x(extent[0]));
//          }
//        }
//        g.selectAll(".bar").attr("d", barPath);
//      });
//      function barPath(groups) {
//        var path = [],
//            i = -1,
//            n = groups.length,
//            d;
//        while (++i < n) {
//          d = groups[i];
//          path.push("M", x(d.key), ",", height, "V", y(d.value), "h", barWidth, "V", height);
//        }
//        return path.join("");
//      }
//      function resizePath(d) {
//        var e = +(d == "e"),
//            x = e ? 1 : -1,
//            y = height / 3;
//        return "M" + (.5 * x) + "," + y
//            + "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6)
//            + "V" + (2 * y - 6)
//            + "A6,6 0 0 " + e + " " + (.5 * x) + "," + (2 * y)
//            + "Z"
//            + "M" + (2.5 * x) + "," + (y + 8)
//            + "V" + (2 * y - 8)
//            + "M" + (4.5 * x) + "," + (y + 8)
//            + "V" + (2 * y - 8);
//      }
//    }
//    brush.on("brushstart.chart", function() {
//      var div = d3.select(this.parentNode.parentNode.parentNode);
//      div.select(".title a").style("display", null);
//    });
//    brush.on("brush.chart", function() {
//      var g = d3.select(this.parentNode),
//          extent = brush.extent();
//      if (round) g.select(".brush")
//          .call(brush.extent(extent = extent.map(round)))
//        .selectAll(".resize")
//          .style("display", null);
//      g.select("#clip-" + id + " rect")
//          .attr("x", x(extent[0]))
//          .attr("width", x(extent[1]) - x(extent[0]));
//      if(!brush.empty()) {
//        dimension.filterRange(extent); 
//      }
//    });
//    brush.on("brushend.chart", function() {
//      if (brush.empty()) {
//        var div = d3.select(this.parentNode.parentNode.parentNode);
//        div.select(".title a").style("display", "none");
//        div.select("#clip-" + id + " rect").attr("x", null).attr("width", "100%");
//        dimension.filterAll();
//      }
//    });
//    chart.margin = function(_) {
//      if (!arguments.length) return margin;
//      margin = _;
//      return chart;
//    };
//    chart.x = function(_) {
//      if (!arguments.length) return x;
//      x = _;
//      axis.scale(x);
//      brush.x(x);
//      return chart;
//    };
//    chart.y = function(_) {
//      if (!arguments.length) return y;
//      y = _;
//      return chart;
//    };
//    chart.barWidth = function(_) {
//      if(!arguments.length) return barWidth;
//      barWidth = _ - 1;
//      return chart;
//    }
//    chart.dimension = function(_) {
//      if (!arguments.length) return dimension;
//      dimension = _;
//      return chart;
//    };
//    chart.filter = function(_) {
//      if (_) {
//        brush.extent(_);
//        dimension.filterRange(_);
//      } else {
//        brush.clear();
//        dimension.filterAll();
//      }
//      brushDirty = true;
//      return chart;
//    };
//    chart.group = function(_) {
//      if (!arguments.length) return group;
//      group = _;
//      return chart;
//    };
//    chart.round = function(_) {
//      if (!arguments.length) return round;
//      round = _;
//      return chart;
//    };
//    return d3.rebind(chart, brush, "on");
//  }

}]);