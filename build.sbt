name := "lcafilter"

organization := "org.coredatra"

version := "0.0.1-SNAPSHOT"

scalaVersion := "2.11.6"

resolvers ++= Seq(
  "snapshots"         at "https://oss.sonatype.org/content/repositories/snapshots",
  "releases"          at "https://oss.sonatype.org/content/repositories/releases"
)

seq(webSettings :_*)
// jetty()
// enablePlugins(JettyPlugin)
// enablePlugins(ContainerPlugin)

unmanagedResourceDirectories in Test <+= (baseDirectory) { _ / "src/main/webapp" }
unmanagedResourceDirectories in Compile += file("resources")
unmanagedResourceDirectories in Runtime += file("resources")
// webappResources <<= baseDirectory { bd => Seq(bd / "src" / "main" / "resources" ) }
// configurationFiles in container.Configuration := Seq(file("src/main/resources/fairscheduler.xml"))
// env in Compile := Some(file(".") / "src" / "main" / "resources" / "fairscheduler.xml" asFile)

scalacOptions ++= Seq("-deprecation", "-unchecked")

libraryDependencies ++= {
  val liftVersion = "3.0-M6"
  val liftEdition = liftVersion.substring(0,3)
  Seq(
    "net.liftweb"             %% "lift-webkit"                        % liftVersion           % "compile",
    "net.liftmodules"         %% ("lift-jquery-module_"+liftEdition)  % "2.9",
    "net.liftmodules"         %% ("ng-js_"+liftEdition)               % "0.2_1.3.9"    % "compile",
    "net.liftmodules"         %% ("ng_"+liftEdition)                  % "0.6.4"               % "compile",
//    "javax.servlet"           % "javax.servlet-api"                   % "3.0.1"               % "provided",
    "org.eclipse.jetty"       % "jetty-webapp"                        % "8.1.7.v20120910"     % "container,test",
    "org.eclipse.jetty.orbit" % "javax.servlet"                       % "3.0.0.v201112011016" % "container,test" artifacts Artifact("javax.servlet", "jar", "jar"),
    "ch.qos.logback"          %   "logback-classic"                   % "1.0.6"               % "compile",
    "org.apache.spark"        %% "spark-core"                         % "1.3.1",
    "net.sf.opencsv"          % "opencsv"                             % "2.3"
  )
}
