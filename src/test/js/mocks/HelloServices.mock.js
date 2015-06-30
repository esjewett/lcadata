angular.module('HelloServices', [])
.factory('helloService', function(){
  var svc = {};
  svc.pageLoadTime = "page load time";
  svc.currentServerTime = function(){ return "current time"; };
  svc.toggleTicker = function(){};
  return svc;
});