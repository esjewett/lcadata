angular.module('DataApp', ['DataServices']).

controller('Data', ['$scope', '$q', 'dataService', function($scope, $q, dataService) {
  var ordinalReducer = reductio();
  ordinalReducer.value("aggCount").sum('count');
  ordinalReducer.value("aggSalary").sum('sum');
  ordinalReducer.alias({ aggAvg: function(g) { return g.aggSalary.sum/g.aggCount.sum; } });
  
  // Create the crossfilter for the relevant dimensions and groups.
  var visas = crossfilter(),
      all = visas.groupAll(),
      iter = visas.dimension(function(d) { return +d.i; }),
      status, statuses, wageUnit, wageUnits, wage, wages,
      numberDisplay, dateChart, stateChart, wageHistogram, employmentState, employmentStates,
      jobTitle, jobTitles, jobChart, statusChart, wageUnitChart,
      numPositionsChart, numPosition, numPositions,
      occupation, occupations, occupationChart,
      year, years, yearChart,
      visaClass, visaClasses, visaClassChart;
      
  reductio()
    .groupAll(function() { return [""]; })
    .sum('count')(all);
  
  $scope.$on('endAdd', function(e) {
    if(firstRun) {
      firstRun = false;
      wageHistogram.filter(dc.filters.RangedFilter(10000,450000));
      dc.redrawAll();
    }
    
    // Figure the max iteration in the data set
    var maxIter = iter.top(1)[0].i;
    
    // For now we need to remove all filters, then remove data. This is because of a bug
    // in crossfilter.remove() where it doesn't work correctly if filters are applied.
    var filters = dc.chartRegistry.list().map(function(c) { return c.filter(); });
    dc.filterAll();
    
    // Remove unnecessary data
    visas.remove(function(d) { return d.i === maxIter; });
    
    // Add filters back
    dc.chartRegistry.list().forEach(function(c, i) { c.filter(filters[i]); });
    
    dc.redrawAll();
    
    $scope.processing = false;
    $scope.steps--;
    resolveCurrentLoad();
  });
  
  $scope.$on('beginAdd', function(e) {
    
  });
  
  var resolveCurrentLoad;
  var currentLoadPromise = $q(function(resolve, reject) { resolveCurrentLoad = resolve; });
  resolveCurrentLoad();
  
  function load() {
    $scope.processing = true;
    return currentLoadPromise.then(function() {
      $scope.processing = true;
      currentLoadPromise = $q(function(resolve, reject) { resolveCurrentLoad = resolve; });
      return dataService.load();
    });
  }
  
  $scope.topRowCount = 0;
  $scope.steps = 0;  // Active navigation steps
  $scope.processing = false;
  
  var firstRun = true;
  
  $scope.$on('addData', function(e, obj) {
        
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
      d.count = +d.count;
      d.avg = +d.avg;
      d.sum = +d.sum;
      d.i = +d.i;
    });
    
    visas.add(newObj);
    
    if(stateChart) stateChart.calculateColorDomain();
    if(jobChart) jobChart.calculateColorDomain();
    
    dc.redrawAll();
  });
  
  $scope.showState = false;
  $scope.removeState = function() {
    stateChart.svg().remove();
    $scope.showState = false;
    dc.deregisterChart(stateChart);
    employmentStates.dispose();
    employmentState.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "employment_state", column: 11 }).then(load);
  }
  $scope.setupState = function() {
    
    var promise = dataService.addDimension({key: "employment_state", column: 11 });
    employmentState = visas.dimension(function(d) { return d.employment_state ? d.employment_state : ""; });
    employmentStates = employmentState.group();
    ordinalReducer(employmentStates);
    
    d3.json("../geo/us-states.json", function (statesJson) {
      var colorScale = d3.scale.quantize().range(["#E2F2FF", "#C4E4FF", "#9ED2FF", "#81C5FF", "#6BBAFF", "#51AEFF", "#36A2FF", "#1E96FF", "#0089FF", "#0061B5"]);
      
      $scope.$apply(function(s) { s.showState = true; });
      
      stateChart = dc.geoChoroplethChart('#state-chart')
        .width(1000)
        .height(600)
        .dimension(employmentState)
        .group(employmentStates)
        .data(function(group) { return group.all().filter(function(d) { return d.key !== ""; }); })
        .colorAccessor(function(d) { return d.value.aggCount.sum; })
        .colors(colorScale)
        .calculateColorDomain()
        .colorCalculator(function (d) { return d ? colorScale(d.aggCount.sum) : '#ccc'; })
        .overlayGeoJson(statesJson.features, "state", function (d) {
            return d.properties.name;
        })
        .title(function (d) {
              return "State: " + d.key + "\nTotal applications: " + formatNumber(d.value && d.value.aggCount && d.value.aggCount.sum);
        })
        .on('preRedraw', function(chart){ chart.calculateColorDomain(); });
      stateChart.render();
    });
    
    return promise;
  }
  $scope.initState = function() {
    $scope.steps++;
    $scope.setupState().then(load);
  }
    
  $scope.showJob = false;
  $scope.removeJob = function() {
    jobChart.svg().remove();
    $scope.showJob = false;
    dc.deregisterChart(jobChart);
    jobTitles.dispose();
    jobTitle.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "job_title", column: 15 }).then(load);
  }
  $scope.setupJob = function () {
    $scope.showJob = true;
    
    var promise = dataService.addDimension({key: "job_title", column: 15 });
    jobTitle = visas.dimension(function(d) { return d.job_title ? d.job_title : ""; });
    jobTitles = jobTitle.group();
    ordinalReducer(jobTitles);
    jobTitles.order(function(d) { return d.aggCount.sum; });
    
    jobChart = dc.bubbleChart('#job-chart')
      .width($("#button-area-2").width())
      .height(600)
      .margins({top: 5, left: 50, right: 100, bottom: 50})
      .dimension(jobTitle)
      .group(jobTitles)
      .colorAccessor(function(d) { return "lightblue"; })
      .keyAccessor(function(d) { return d.value.aggCount.sum; })
      .valueAccessor(function(d) { return d.value.aggAvg(); })
      .radiusValueAccessor(function(d) { return 100; })
      .minRadiusWithLabel(0)
      .x(d3.scale.log().domain([0, jobTitles.top(1)[0] ? jobTitles.top(1)[0] : 1 ]))
      .yAxisPadding(5000)
      .clipPadding(1000)
      .elasticY(true)
      .elasticX(true)
      .elasticRadius(true)
      .renderHorizontalGridLines(true)
      .renderVerticalGridLines(true)
      .xAxisLabel("Number of applications")
      .yAxisLabel("Average Salary")
      .renderLabel(true)
      .data(function(group) { return group.top(31).filter(function(d) { return d.key !== ""; }); })
      .label(function(d) { return d.key; })
      .title(function(d) { return d.key + " (" + d.value.aggCount.sum + " applications, $" + Math.round(d.value.aggAvg()) + " average salary)";});
      
    jobChart.xAxis().tickFormat(d3.format("s"));
    jobChart.yAxis().tickFormat(d3.format("s"));
      
    jobChart.render();
    
    return promise;
  }
  $scope.initJob = function() {
    $scope.steps++;
    $scope.setupJob().then(load);
  }
  
  $scope.showOccupation = false;
  $scope.removeOccupation = function() {
    occupationChart.svg().remove();
    $scope.showOccupation = false;
    dc.deregisterChart(occupationChart);
    occupations.dispose();
    occupation.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "occupation", column: 14 }).then(load);
  }
  $scope.setupOccupation = function () {
    $scope.showOccupation = true;
    
    var promise = dataService.addDimension({key: "occupation", column: 14 });
    occupation = visas.dimension(function(d) { return d.occupation ? d.occupation : ""; });
    occupations = occupation.group();
    ordinalReducer(occupations);
    occupations.order(function(d) { return d.aggCount.sum; });
    
    occupationChart = dc.bubbleChart('#occupation-chart')
      .width($("#button-area-2").width())
      .height(600)
      .margins({top: 5, left: 50, right: 100, bottom: 50})
      .dimension(occupation)
      .group(occupations)
      .colorAccessor(function(d) { return "lightblue"; })
      .keyAccessor(function(d) { return d.value.aggCount.sum; })
      .valueAccessor(function(d) { return d.value.aggAvg(); })
      .radiusValueAccessor(function(d) { return 100; })
      .minRadiusWithLabel(0)
      .x(d3.scale.log().domain([0, occupations.top(1)[0] ? occupations.top(1)[0] : 1 ]))
      .yAxisPadding(5000)
      .clipPadding(1000)
      .elasticY(true)
      .elasticX(true)
      .elasticRadius(true)
      .renderHorizontalGridLines(true)
      .renderVerticalGridLines(true)
      .xAxisLabel("Number of applications")
      .yAxisLabel("Average Salary")
      .renderLabel(true)
      .data(function(group) { return group.top(31).filter(function(d) { return d.key !== ""; }); })
      .label(function(d) { return d.key; })
      .title(function(d) { return d.key + " (" + d.value.aggCount.sum + " applications, $" + Math.round(d.value.aggAvg()) + " average salary)";});
      
    occupationChart.xAxis().tickFormat(d3.format("s"));
    occupationChart.yAxis().tickFormat(d3.format("s"));
      
    occupationChart.render();
    
    return promise;
  }
  $scope.initOccupation = function() {
    $scope.steps++;
    $scope.setupOccupation().then(load);
  }
  
  $scope.showStatus = false;
  $scope.removeStatus = function() {
    statusChart.svg().remove();
    $scope.showStatus = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(statusChart);
    status.dispose();
    statuses.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "status", column: 2 }).then(load);
  }
  $scope.setupStatus = function () {
    $scope.showStatus = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "status", column: 2 });
    status = visas.dimension(function(d) { return d.status ? d.status : ""; });
    statuses = status.group();
    ordinalReducer(statuses);
    
    statusChart = dc.rowChart('#status-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, left: 10, right: 10, bottom: 20})
      .group(statuses)
      .data(function(group) { return group.all().filter(function(d) { return d.key !== ""; }); })
      .valueAccessor(function(d) { return d.value && d.value.aggCount && d.value.aggCount.sum ? d.value.aggCount.sum : 0; })
      .labelOffsetY(function() { return 7; })
      .labelOffsetX(function() { return 5; })
      .dimension(status)
      .ordinalColors(['#3182bd'])
      .elasticX(true);
      
    statusChart.xAxis().ticks(5).tickFormat(d3.format("s"));;
      
    statusChart.render();
    
    return promise;
  }
  $scope.initStatus = function() {
    $scope.steps++;
    $scope.setupStatus().then(load);
  }
  
  $scope.showWage = false;
  $scope.removeWage = function() {
    wageHistogram.svg().remove();
    $scope.showWage = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(wageHistogram);
    wage.dispose();
    wages.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "wage_from", column: 36, round: 10000 }).then(load);
  }
  $scope.setupWage = function () {
    $scope.showWage = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "wage_from", column: 36, round: 10000 });
    wage = visas.dimension(function(d) { return d.wage_from ? Math.min(Math.max(+d.wage_from, 10000),500000) : 0; });
    wages = wage.group(function(d) { return Math.min(d, 500000); }).reduceSum(function(d) { return d.count; });
    
    wageHistogram = dc.barChart('#wage-histogram-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, right: 20, bottom: 20, left: 50})
      .dimension(wage)
      .group(wages)
      .x(d3.scale.linear().domain([10000, 500001]))
      .yAxisLabel("# of applications")
      .on('renderlet', function(chart, filter) {
        var bars = d3.select(chart.svg()[0][0])
          .selectAll('.bar');
        var data = bars.data();
        var total = data.reduce(function(a,b) { return a+b.data.value; }, 0);
        var count = 0;
        var median = 0;
        for(var i = 0; i < data.length; i++) {
          if(count < total/2) {
            count += data[i].data.value;
            if(count > total/2) {
              median = data[i].data.key;
            }
          }
        }
        bars.filter(function(d) { return d.data.key === median; }).attr('fill', 'red');
      })
      .elasticY(true);
      
    wageHistogram.xAxis().ticks(5).tickFormat(d3.format("$s"));
    wageHistogram.yAxis().tickFormat(d3.format("s"));
      
    wageHistogram.render();
    
    return promise;
  }
  $scope.initWage = function() {
    $scope.steps++;
    $scope.setupWage().then(load);
  }
  
  $scope.showUnit = false;
  $scope.removeUnit = function() {
    wageUnitChart.svg().remove();
    $scope.showUnit = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(wageUnitChart);
    wageUnit.dispose();
    wageUnits.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "wage_unit", column: 18 }).then(load);
  }
  $scope.setupUnit = function () {
    $scope.showUnit = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "wage_unit", column: 18 });
    wageUnit = visas.dimension(function(d) { return d.wage_unit ? d.wage_unit : ""; });
    wageUnits = wageUnit.group();
    ordinalReducer(wageUnits);
    
    wageUnitChart = dc.rowChart('#wage-unit-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, left: 10, right: 10, bottom: 20})
      .group(wageUnits)
      .dimension(wageUnit)
      .data(function(group) { return group.all().filter(function(d) { return d.key !== ""; }); })
      .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
      .ordinalColors(['#3182bd'])
      .elasticX(true);
      
    wageUnitChart.xAxis().ticks(5).tickFormat(d3.format("s"));
      
    wageUnitChart.render();
    
    return promise;
  }
  $scope.initUnit = function() {
    $scope.steps++;
    $scope.setupUnit().then(load);
  }
  
  $scope.showNumPositions = false;
  $scope.removeNumPositions = function() {
    numPositionsChart.svg().remove();
    $scope.showNumPositions = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(numPositionsChart);
    numPosition.dispose();
    numPositions.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "num_positions", column: 20 }).then(load);
  }
  $scope.setupNumPositions = function () {
    var max = 20;
    var min = 1;
    
    $scope.showNumPositions = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "num_positions", column: 20 });
    numPosition = visas.dimension(function(d) { return d.num_positions ? Math.min(Math.max(+d.num_positions, min),max) : 0; });
    numPositions = numPosition.group(function(d) { return Math.min(d, max); }).reduceSum(function(d) { return d.count; });
    
    numPositionsChart = dc.barChart('#num-positions-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, right: 10, bottom: 20, left: 50})
      .group(numPositions)
      .dimension(numPosition)
      .round(dc.round.floor)
      .alwaysUseRounding(true)
      .x(d3.scale.linear().domain([min, max ]))
      .elasticY(true);

    numPositionsChart.xAxis().ticks(5);
      
    numPositionsChart.render();
    
    return promise;
  }
  $scope.initNumPositions = function() {
    $scope.steps++;
    $scope.setupNumPositions().then(load);
  }
  
  
  $scope.showYear = false;
  $scope.removeYear = function() {
    yearChart.svg().remove();
    $scope.showYear = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(yearChart);
    year.dispose();
    years.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "year", column: 37}).then(load);
  }
  $scope.setupYear = function () {
    $scope.showYear = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "year", column: 37});
    year = visas.dimension(function(d) { return d.year ? "20" + d.year : ""; });
    years = year.group();
    ordinalReducer(years);
    
    yearChart = dc.rowChart('#year-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, left: 10, right: 10, bottom: 20})
      .group(years)
      .dimension(year)
      .data(function(group) { return group.all().filter(function(d) { return d.key !== ""; }); })
      .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
      .ordinalColors(['#3182bd'])
      .elasticX(true);
      
    yearChart.xAxis().ticks(5);
      
    yearChart.render();
    
    return promise;
  }
  $scope.initYear = function() {
    $scope.steps++;
    $scope.setupYear().then(load);
  }
  
  $scope.showClass = false;
  $scope.removeClass = function() {
    visaClassChart.svg().remove();
    $scope.showClass = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(visaClass);
    visaClass.dispose();
    visaClasses.dispose();
    $scope.steps++;
    dataService.removeDimension({key: "visa_class", column: 5}).then(load);
  }
  $scope.setupClass = function () {
    $scope.showClass = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension({key: "visa_class", column: 5});
    visaClass = visas.dimension(function(d) { return d.visa_class ? d.visa_class : ""; });
    visaClasses = visaClass.group();
    ordinalReducer(visaClasses);
    
    visaClassChart = dc.rowChart('#visa-class-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, left: 10, right: 10, bottom: 20})
      .group(visaClasses)
      .dimension(visaClass)
      .data(function(group) { return group.all().filter(function(d) { return d.key !== ""; }); })
      .valueAccessor(function(d) { return d.value.aggCount ? d.value.aggCount.sum : 0; })
      .ordinalColors(['#3182bd'])
      .elasticX(true);
      
    visaClassChart.xAxis().ticks(5);
      
    visaClassChart.render();
    
    return promise;
  }
  $scope.initClass = function() {
    $scope.steps++;
    $scope.setupClass().then(load);
  }
  
  dataService.preRegisterDimensions({
    dimensions: [
      {key: "visa_class", column: 5},
      {key: "employment_state", column: 11 },
      {key: "job_title", column: 15 },
      {key: "occupation", column: 14 },
      {key: "status", column: 2 },
      {key: "wage_from", column: 36, round: 10000 },
      {key: "wage_unit", column: 18 },
      {key: "num_positions", column: 20 },
      {key: "year", column: 37}
    ]});
  
  // Setup default dimensions
  $scope.steps++;
  $scope.setupStatus().then($scope.setupWage).then(load);
  
  // Various formatters.
  var formatNumber = d3.format(",d");
      
  // Setup charts
  numberDisplay = dc.dataCount("#totals")
    .dimension({ size: function() { return 2078573; } })
    //.dimension({ size: function() { return all.value()[0] ? all.value()[0].value.sum : 0; } })
    .group({ value: function() { return all.value()[0] ? all.value()[0].value.sum : 0; }})
    .html({
      some: '%filter-count out of %total-count applications displayed',
      all: 'All %total-count applications displayed'
    });
    
  // Disable transitions for real interactive filtering
  dc.disableTransitions = true;
    
  dc.renderAll();
  
}]);