importScripts('crossfilter.js', 'reductio.js');

var vars = {};

onmessage = function(e) {
  switch(e.data.type) {
    case 'reductio_var':
      reductio_var(e);
      break;
    case 'crossfilter_var':
      crossfilter_var(e);
      break;
    case 'var_methods':
      var_methods(e);
      break;
    case 'var_method_function':
      var_method_function(e);
      break;
    case 'call_var_on_var':
      call_var_on_var(e)
      break;
    case 'var_method_return':
      var_method_return(e);
      break;
    case 'var_unstructured_method_return':
      var_unstructured_method_return(e);
      break;
  }
}

function reductio_var(e) {
  vars[e.data.id] = reductio();
  if(e.data.uid) { postMessage({ uid: e.data.uid }); }
}

function crossfilter_var(e) {
  vars[e.data.id] = crossfilter();
  if(e.data.uid) { postMessage({ uid: e.data.uid }); }
}

function var_methods(e) {
  var temp;
  temp = e.data.methods.reduce(function(r,m) {
    return r[m.method].apply(null, m.args);
  }, vars[e.data.id]);
  if(e.data.newId !== undefined) {
    vars[e.data.newId] = temp;
  }
  if(e.data.uid) { postMessage({ uid: e.data.uid }); }
}

function var_method_function(e) {
  var temp, func;
  func = unpackFunction(e.data.func, e.data.context)
  temp = vars[e.data.id][e.data.method].call(null, func);
  if(e.data.newId !== undefined) {
    vars[e.data.newId] = temp;
  }
  if(e.data.uid) { postMessage({ uid: e.data.uid }); }
}

function call_var_on_var(e) {
  vars[e.data.callFunc].call(null, vars[e.data.arg]);
  if(e.data.uid) { postMessage({ uid: e.data.uid }); }
}

function var_method_return(e) {
  var dat = vars[e.data.id][e.data.method].call(null, e.data.arg);
  dat.uid = e.data.uid;
  if(e.data.return_unit) {
    postMessage({
      uid: e.data.uid,
      unit: true
    })
  } else {
    postMessage(dat);
  }
}

function var_unstructured_method_return(e) {
  var dat = vars[e.data.id][e.data.method].call(null, e.data.arg);
  var strct = {};
  strct.data = dat;
  strct.uid = e.data.uid;
  postMessage(strct);
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