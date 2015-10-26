angular.module('DataApp', ['DataServices']).

controller('Data', ['$scope', '$q', 'dataService', function($scope, $q, dataService) {
  
  var ordinalReducer = reductio_facade();
  ordinalReducer.value("aggCount").sum('count');
  ordinalReducer.value("aggSalary").sum('sum');
  
  // Create the crossfilter for the relevant dimensions and groups.
  var visas = crossfilter_facade([], dc.redrawAll),
      all = visas.groupAll(),
      iter = visas.dimension(function(d) { return +d.i; }),
      status, statuses, wageUnit, wageUnits, wage, wages,
      numberDisplay, dateChart, stateChart, wageHistogram, employmentState, employmentStates,
      jobTitle, jobTitles, jobChart, statusChart, wageUnitChart,
      numPositionsChart, numPosition, numPositions,
      occupation, occupations, occupationChart,
      year, years, yearChart,
      visaClass, visaClasses, visaClassChart;
  
  reductio_facade()
    .groupAll(function() { return [""]; })
    .count(true)
    .sum('count')(all);

  var payloadSchema = "";
  function saveSchema(schema) {
    payloadSchema = schema;
    return true;
  }
    
  var rehydrateFilter = function(f) {
    if(Array.isArray(f)) {
      return dc.filters.RangedFilter(f[0],f[1]);
    } else {
      return f;
    }
  };
  
  var filterHandler = function (dimension, filters) {
    if (filters.length === 0) {
      dimension.filter(null);
    } else if (filters.length === 1 && !Array.isArray(filters[0])) {
      dimension.filterExact(filters[0]);
    } else if(filters.length === 1 && Array.isArray(filters[0]) &&
      filters[0].isFiltered &&
      typeof filters[0][0] === typeof filters[0][1]) {

      dimension.filterRange([filters[0][0], filters[0][1]]);
    } else {
      dimension.filterFunction(function (d) {
        for (var i = 0; i < filters.length; i++) {
          var filter = filters[i];
          if (filter.isFiltered && filter.isFiltered(d)) {
            return true;
          } else if (filter <= d && filter >= d) {
            return true;
          }
        }
        return false;
      }, 'var filters = ' + JSON.stringify(filters) + '.map(' + rehydrateFilter.toString() + ');');
    }
    return filters;
  };
  
  var maxIter = 0;
  $scope.$on('endAdd', function(e) {
    if(firstRun) {
      firstRun = false;
      wageHistogram.filter(dc.filters.RangedFilter(10000,450000));
      dc.redrawAll();
    }
    
    // For now we need to remove all filters, then remove data. This is because of a bug
    // in crossfilter.remove() where it doesn't work correctly if filters are applied.
    var filters = dc.chartRegistry.list().map(function(c) { return c.filters(); });
    dc.filterAll();
    
    // Remove unnecessary data
    visas.remove('function(d) { return d.i ===' + maxIter + '; }');
    
    // Add filters back
    dc.chartRegistry.list().forEach(function(c, i) {
      if(typeof filters[i][0] === 'string') {
        // Assume ordinal filter special case.
        c.filter([filters[i]]); // Note surrounding array!!
      } else {
        if(filters[i][0]) {
          // Assume ranged filter.
          c.filter(filters[i][0]);
        }
      }
    });
    
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

  var Buffer = buffer.Buffer;

  $scope.$on('addData', function(e, obj) {

    var bString = atob(obj.byteString);
    var bytes = [];
    for(var i=0; i<bString.length; i++) {
      bytes.push(bString.charCodeAt(i) < 127 ? bString.charCodeAt(i) : (-256 + bString.charCodeAt(i)));
    }

    var buff = new Buffer(bytes);

    var type = avsc.parse(obj.schema);
    var parsedObj = type.fromBuffer(buff);
    
    parsedObj.forEach(function(d, i) {
      d.count = +d.count;
      d.avg = +d.avg;
      d.sum = +d.sum;
      d.i = +d.i;
      if(d.i > maxIter) maxIter = d.i;
    });
    
    visas.add(parsedObj).then(dc.redrawAll);
    
    if(stateChart) stateChart.calculateColorDomain();
    if(jobChart) jobChart.calculateColorDomain();
    
    dc.redrawAll();
  });
  
  var stateDimension = {key: "employment_state", column: 11 };
  $scope.showState = false;
  $scope.removeState = function() {
    stateChart.svg().remove();
    $scope.showState = false;
    dc.deregisterChart(stateChart);
    employmentStates.dispose();
    employmentState.dispose();
    $scope.steps++;
    dataService.removeDimension(stateDimension).then(saveSchema).then(load);
  }
  $scope.setupState = function() {
    
    var promise = dataService.addDimension(stateDimension).then(saveSchema);
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
      stateChart.jsonDimension = stateDimension;
      stateChart.filterHandler(filterHandler);
    });
    
    return promise;
  }
  $scope.initState = function() {
    $scope.steps++;
    $scope.setupState().then(load);
  }
  
  var jobDimension = {key: "job_title", column: 15 };
  $scope.showJob = false;
  $scope.removeJob = function() {
    jobChart.svg().remove();
    $scope.showJob = false;
    dc.deregisterChart(jobChart);
    jobTitles.dispose();
    jobTitle.dispose();
    $scope.steps++;
    dataService.removeDimension(jobDimension).then(saveSchema).then(load);
  }
  $scope.setupJob = function () {
    $scope.showJob = true;
    
    var promise = dataService.addDimension(jobDimension).then(saveSchema);
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
      .valueAccessor(function(d) { return d.value.aggSalary.sum/d.value.aggCount.sum; })
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
      .data(function(group) { return group.top(30).filter(function(d) { return d.key !== ""; }); })
      .label(function(d) { return d.key ? d.key : "None listed"; })
      .title(function(d) { return d.key + " (" + d.value.aggCount.sum + " applications, $" + Math.round(d.value.aggSalary.sum/d.value.aggCount.sum) + " average salary)";});
      
    jobChart.xAxis().tickFormat(d3.format("s"));
    jobChart.yAxis().tickFormat(d3.format("s"));
    jobChart.jsonDimension = jobDimension;
    jobChart.filterHandler(filterHandler);
      
    jobChart.render();
    
    return promise;
  }
  $scope.initJob = function() {
    $scope.steps++;
    $scope.setupJob().then(load);
  }
  
  var occupationDimension = {key: "occupation", column: 14 };
  $scope.showOccupation = false;
  $scope.removeOccupation = function() {
    occupationChart.svg().remove();
    $scope.showOccupation = false;
    dc.deregisterChart(occupationChart);
    occupations.dispose();
    occupation.dispose();
    $scope.steps++;
    dataService.removeDimension(occupationDimension).then(saveSchema).then(load);
  }
  $scope.setupOccupation = function () {
    $scope.showOccupation = true;
    
    var promise = dataService.addDimension(occupationDimension).then(saveSchema);
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
      .valueAccessor(function(d) { return d.value.aggSalary.sum/d.value.aggCount.sum; })
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
      .data(function(group) { return group.top(30); })
      .label(function(d) { return d.key ? d.key : "None listed"; })
      .title(function(d) { return d.key + " (" + d.value.aggCount.sum + " applications, $" + Math.round(d.value.aggSalary.sum/d.value.aggCount.sum) + " average salary)";});
      
    occupationChart.xAxis().tickFormat(d3.format("s"));
    occupationChart.yAxis().tickFormat(d3.format("s"));
    occupationChart.jsonDimension = occupationDimension;
    occupationChart.filterHandler(filterHandler);
      
    occupationChart.render();
    
    return promise;
  }
  $scope.initOccupation = function() {
    $scope.steps++;
    $scope.setupOccupation().then(load);
  }
  
  var statusDimension = {key: "status", column: 2 };
  $scope.showStatus = false;
  $scope.removeStatus = function() {
    statusChart.svg().remove();
    $scope.showStatus = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(statusChart);
    status.dispose();
    statuses.dispose();
    $scope.steps++;
    dataService.removeDimension(statusDimension).then(saveSchema).then(load);
  }
  $scope.setupStatus = function () {
    $scope.showStatus = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(statusDimension).then(saveSchema);
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
      
    statusChart.filterHandler(filterHandler);
      
    statusChart.xAxis().ticks(5).tickFormat(d3.format("s"));;
    
    statusChart.jsonDimension = statusDimension;
      
    statusChart.render();
    
    return promise;
  }
  $scope.initStatus = function() {
    $scope.steps++;
    $scope.setupStatus().then(load);
  }
  
  var wageDimension = {key: "wage_from", column: 36, round: 10000 };
  $scope.showWage = false;
  $scope.removeWage = function() {
    wageHistogram.svg().remove();
    $scope.showWage = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(wageHistogram);
    wage.dispose();
    wages.dispose();
    $scope.steps++;
    dataService.removeDimension(wageDimension).then(saveSchema).then(load);
  }
  $scope.setupWage = function () {
    $scope.showWage = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(wageDimension).then(saveSchema);
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
      .on('pretransition', function(chart, filter) {
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
        bars.filter(function(d) { return d.data.key === median; }).attr('fill', 'darkred');
      })
      .elasticY(true);
    
    wageHistogram.filterHandler(filterHandler);
    wageHistogram.xAxis().ticks(5).tickFormat(d3.format("$s"));
    wageHistogram.yAxis().tickFormat(d3.format("s"));
    wageHistogram.jsonDimension = wageDimension;
      
    wageHistogram.render();
    
    return promise;
  }
  $scope.initWage = function() {
    $scope.steps++;
    $scope.setupWage().then(load);
  }
  
  var unitDimension = {key: "wage_unit", column: 18 };
  $scope.showUnit = false;
  $scope.removeUnit = function() {
    wageUnitChart.svg().remove();
    $scope.showUnit = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(wageUnitChart);
    wageUnit.dispose();
    wageUnits.dispose();
    $scope.steps++;
    dataService.removeDimension(unitDimension).then(saveSchema).then(load);
  }
  $scope.setupUnit = function () {
    $scope.showUnit = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(unitDimension).then(saveSchema);
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
    wageUnitChart.jsonDimension = unitDimension;
    wageUnitChart.filterHandler(filterHandler);
      
    wageUnitChart.render();
    
    return promise;
  }
  $scope.initUnit = function() {
    $scope.steps++;
    $scope.setupUnit().then(load);
  }
  
  var positionsDimension = {key: "num_positions", column: 20 };
  $scope.showNumPositions = false;
  $scope.removeNumPositions = function() {
    numPositionsChart.svg().remove();
    $scope.showNumPositions = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(numPositionsChart);
    numPosition.dispose();
    numPositions.dispose();
    $scope.steps++;
    dataService.removeDimension(positionsDimension).then(saveSchema).then(load);
  }
  $scope.setupNumPositions = function () {
    $scope.showNumPositions = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(positionsDimension).then(saveSchema);
    numPosition = visas.dimension(function(d) { return d.num_positions ? Math.min(Math.max(+d.num_positions, 1),20) : 0; });
    numPositions = numPosition.group(function(d) { return Math.min(d, 20); }).reduceSum(function(d) { return d.count; });
    
    numPositionsChart = dc.barChart('#num-positions-chart')
      .height(180)
      .width($("#button-area-1").width())
      .margins({top: 5, right: 10, bottom: 20, left: 50})
      .group(numPositions)
      .dimension(numPosition)
      .round(dc.round.floor)
      .alwaysUseRounding(true)
      .x(d3.scale.linear().domain([1, 20 ]))
      .elasticY(true);

    numPositionsChart.xAxis().ticks(5);
    numPositionsChart.yAxis().tickFormat(d3.format("s"));
    numPositionsChart.jsonDimension = positionsDimension;
    numPositionsChart.filterHandler(filterHandler);
      
    numPositionsChart.render();
    
    return promise;
  }
  $scope.initNumPositions = function() {
    $scope.steps++;
    $scope.setupNumPositions().then(load);
  }
  
  
  var yearDimension = {key: "year", column: 37};
  $scope.showYear = false;
  $scope.removeYear = function() {
    yearChart.svg().remove();
    $scope.showYear = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(yearChart);
    year.dispose();
    years.dispose();
    $scope.steps++;
    dataService.removeDimension(yearDimension).then(saveSchema).then(load);
  }
  $scope.setupYear = function () {
    $scope.showYear = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(yearDimension).then(saveSchema);
    year = visas.dimension(function(d) { return d.year ? "" + d.year : ""; });
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
      .label(function(d) { return "20" + d.key; })
      .ordinalColors(['#3182bd'])
      .elasticX(true);
      
    yearChart.xAxis().ticks(5);
    yearChart.jsonDimension = yearDimension;
    yearChart.filterHandler(filterHandler);
      
    yearChart.render();
    
    return promise;
  };
  $scope.initYear = function() {
    $scope.steps++;
    $scope.setupYear().then(load);
  };
  
  var classDimension = {key: "visa_class", column: 5};
  $scope.showClass = false;
  $scope.removeClass = function() {
    visaClassChart.svg().remove();
    $scope.showClass = false;
    $scope.topRowCount -= 1;
    dc.deregisterChart(visaClass);
    visaClass.dispose();
    visaClasses.dispose();
    $scope.steps++;
    dataService.removeDimension(classDimension).then(saveSchema).then(load);
  };
  $scope.setupClass = function () {
    $scope.showClass = true;
    $scope.topRowCount += 1;
    
    var promise = dataService.addDimension(classDimension).then(saveSchema);
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
    visaClassChart.jsonDimension = classDimension;
    visaClassChart.filterHandler(filterHandler);
      
    visaClassChart.render();
    
    return promise;
  };
  $scope.initClass = function() {
    $scope.steps++;
    $scope.setupClass().then(load);
  };
  
  $scope.detailHeader = [
    "Case Number",
    "Status",
    "Submit Date",
    "Decision Date",
    "Visa Class",
    "Employment Start Date",
    "Employment End Date",
    "Employer Name",
    "Employer Address",
    "Employer City",
    "Employer State",
    "Employer Postal Code",
    "SOC Code",
    "SOC Name",
    "Job Title",
    "Proposed Wage Rate",
    "Proposed Maximum Wage",
    "Wage unit",
    "Full Time (Y/N)",
    "Number of Workers",
    "City of Job",
    "State of Job",
    "Prevailing Wage Rate",
    "Prevailing Wage Unit",
    "Prevailing Wage Source",
    "Wage Source Desc (cont)",
    "Year of Publication",
    "City of Job(2)",
    "State of Job(2)",
    "Prevailing Wage Rate(2)",
    "Prevailing Wage Unit(2)",
    "Prevailing Wage Source(2)",
    "Wage Source Desc (cont)(2)",
    "Year of Publication(2)",
    "NAICS Industry Code",
    "Calculated Wage",
    "Year (YY)"
  ];
  $scope.detailRecords = [];
  $scope.viewDetail = function() {
    $scope.detailRecords = [];
    var filters = dc.chartRegistry.list().map(function(c, i) {
      if(c.filters().length === 0) {
        return undefined;
      } else {
        var filter = {
          dimension: c.jsonDimension
        };
        if(typeof c.filters()[0] === 'string') {
          // Assume this is an ordinal dimension filter.
          filter.ordinalFilter = c.filters();
        } else {
          // Assume this is a range filter.
          filter.rangeFilter = c.filters()[0];
        }
        return filter;
      }
    }).filter(function(d) { return d; });
    
    $scope.gettingDetail = true;
    dataService.getDetail({ filters: filters }).then(function(details) {
      $scope.detailRecords = details;
      $scope.gettingDetail = false;
    }, function(err) {
      $scope.detailRecords = [];
      $scope.gettingDetail = false;
    });
    $scope.filterCount = formatNumber(all.value()[0] ? all.value()[0].value.sum : 0);
  };
  
  // Setup default dimensions
  $scope.steps++;
  $scope.setupStatus().then($scope.setupWage).then(load);
  
  // Various formatters.
  var formatNumber = d3.format(",d");
      
  // Setup charts
  numberDisplay = dc.dataCount("#totals")
    .dimension({ size: function() { return 2582581; } })
    //.dimension({ size: function() { return all.value()[0] ? all.value()[0].value.sum : 0; } })
    .group({ value: function() { return all.value()[0] ? all.value()[0].value.sum : 0; }})
    .html({
      some: '%filter-count out of %total-count applications displayed',
      all: 'All %total-count applications displayed'
    });
    
  clientRecords = dc.dataCount("#client-records")
    .dimension({ size: function() { return visas.size(); } })
    .group({ value: function() { return all.value()[0] ? all.value()[0].value.count : 0; }})
    .html({
      some: ' (%total-count total client-side records)',
      all: ' (%total-count total client-side records)'
    });
    
  // Disable transitions for real interactive filtering
  dc.disableTransitions = true;
  dc.constants.EVENT_DELAY = 0;
    
  dc.renderAll();
  
}]);