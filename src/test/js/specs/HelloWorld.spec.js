describe('HelloWorld App', function(){
  var helloMock = {};
  var rootScope = {};
  var scope = {};

  beforeEach(module('HelloWorldApp'));

  beforeEach(function(){
    angular.mock.module( function($provide) {
      $provide.value('helloService', helloMock);
    });
  });

  beforeEach(inject(['$rootScope', '$controller', '$q', function($rootScope, $controller, $q){
    rootScope = $rootScope;
    scope = $rootScope.$new();

    helloMock.pageLoadTime = "load time";
    helloMock.callCount = 0;
    helloMock.serverTimeDefer = $q.defer();
    helloMock.currentServerTime = function() {
      this.callCount += 1;
      return this.serverTimeDefer.promise;
    };

    $controller('Hello', { $scope: scope, helloService: helloMock })
  }]));

  describe('Hello Controller', function(){
    it('should set the pageLoadTime from the service', function() {
      expect(scope.pageLoadTime).toBe("load time");
    });

    it('should call the service\'s currentServerTime when checkTime() is invoked', function() {
      scope.checkTime();
      expect(helloMock.callCount).toBe(1);

      helloMock.serverTimeDefer.resolve("new time");
      // Allow the $q defer/promise to resolve
      rootScope.$digest();

      expect(scope.lastTime).toBe("new time");
    });

    it('should set the hello service on the scope so we can call toggleTicker', function() {
      expect(scope.svc).toBe(helloMock);
    });
  });
});