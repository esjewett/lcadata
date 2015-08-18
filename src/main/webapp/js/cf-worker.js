importScripts('crossfilter.js', 'reductio.js', 'd3.js', 'dc.js');

var vars = {};

onmessage = function(e) {
  var temp, func;
  
  switch(e.data.type) {
    case 'reductio_var': vars[e.data.id] = reductio();
      break;
    case 'crossfilter_var': vars[e.data.id] = crossfilter();
      break;
    case 'var_methods':
      temp = e.data.methods.reduce(function(r,m) {
        return r[m.method].apply(null, m.args);
      }, vars[e.data.id]);
      if(e.data.newId !== undefined) {
        vars[e.data.newId] = temp;
      }
      break;
    case 'var_method_function':
      func = unpackFunction(e.data.func, e.data.context)
      temp = vars[e.data.id][e.data.method].call(null, func);
      if(e.data.newId !== undefined) {
        vars[e.data.newId] = temp;
      }
      break;
    case 'call_var_on_var':
      vars[e.data.callFunc].call(null, vars[e.data.arg]);
      break;
    case 'var_method_return':
      var dat = vars[e.data.id][e.data.method].call(null, e.data.arg);
      dat.return_id = e.data.return_id;
      postMessage(dat);
      break;
    case 'var_unstructured_method_return':
      var dat = vars[e.data.id][e.data.method].call(null, e.data.arg);
      var strct = {};
      strct.data = dat;
      strct.return_id = e.data.return_id;
      postMessage(strct);
      break;
  }
}

function unpackFunction(func, context) {
  var internal, evalStr = "";
  if(context) {
    evalStr += context;
  }
  evalStr += "internal = " + func;
  eval(evalStr);
  return internal;
}