name := "h1bfilter"

organization := "org.coredatra"

version := "0.0.1-SNAPSHOT"

scalaVersion := "2.11.6"

resolvers ++= Seq(
  "snapshots"         at "https://oss.sonatype.org/content/repositories/snapshots",
  "releases"          at "https://oss.sonatype.org/content/repositories/releases"
)

seq(webSettings :_*)

unmanagedResourceDirectories in Test <+= (baseDirectory) { _ / "src/main/webapp" }

scalacOptions ++= Seq("-deprecation", "-unchecked")

libraryDependencies ++= {
  val liftVersion = "3.0-M5-1"
  val liftEdition = liftVersion.substring(0,3)
  Seq(
    "net.liftweb"             %% "lift-webkit"                        % liftVersion           % "compile",
    "net.liftmodules"         %% ("lift-jquery-module_"+liftEdition)  % "2.9-SNAPSHOT",
    "net.liftmodules"         %% ("ng-js_"+liftEdition)               % "0.2_1.3.9"    % "compile",
    "net.liftmodules"         %% ("ng_"+liftEdition)                  % "0.6.4"               % "compile",
    "org.eclipse.jetty"       % "jetty-webapp"                        % "8.1.7.v20120910"     % "container,test",
    "org.eclipse.jetty.orbit" % "javax.servlet"                       % "3.0.0.v201112011016" % "container,test" artifacts Artifact("javax.servlet", "jar", "jar"),
    "ch.qos.logback"          %   "logback-classic"                   % "1.0.6"               % "compile",
    "org.scalatest"           %%  "scalatest"                         % "2.2.4"               % "test->*", // http://www.scalatest.org/
    "org.seleniumhq.selenium" %   "selenium-java"                     % "2.45.0"              % "test",     // http://www.seleniumhq.org/download/
    "org.apache.spark"        %% "spark-core"                         % "1.3.1",
    "net.sf.opencsv"          % "opencsv"                             % "2.3"
  )
}

// Jasmine stuff
seq(jasmineSettings : _*)

appJsDir <+= sourceDirectory { src => src / "main" / "webapp" / "js" }

appJsLibDir <+= sourceDirectory { src => src / "test" / "js" / "3rdlib" }

jasmineTestDir <+= sourceDirectory { src => src /  "test" / "js" }

jasmineConfFile <+= sourceDirectory { src => src / "test" / "js" / "3rdlib" / "test.dependencies.js" }

jasmineRequireJsFile <+= sourceDirectory { src => src / "test" / "js" / "3rdlib" / "require" / "require-2.0.6.js" }

jasmineRequireConfFile <+= sourceDirectory { src => src / "test" / "js" / "3rdlib" / "require.conf.js" }

(Keys.test in Test) <<= (Keys.test in Test) dependsOn (jasmine)