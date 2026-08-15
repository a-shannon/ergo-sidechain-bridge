ThisBuild / organization := "org.ergoplatform.bridge"
ThisBuild / scalaVersion := "2.12.20"
ThisBuild / version := "0.1.0"

lazy val runtimeBundle = taskKey[File](
  "Materialize the exact ordered runtime classpath for resolver-free conformance execution",
)

lazy val root = (project in file("."))
  .settings(
    name := "authenticated-v2-exact-compiler",
    libraryDependencies += "org.scorexfoundation" %% "sigma-state" % "6.0.2",
    Compile / mainClass := Some("org.ergoplatform.bridge.tools.ExactAuthenticatedV2Compiler"),
    Compile / run / fork := true,
    Compile / run / connectInput := false,
    publish / skip := true,
    runtimeBundle := {
      val output = target.value / "locked-runtime"
      val entries = (Runtime / fullClasspath).value.map(_.data)
      require(entries.nonEmpty, "runtime classpath must not be empty")
      IO.delete(output)
      IO.createDirectory(output)
      entries.zipWithIndex.foreach { case (entry, index) =>
        require(entry.isFile || entry.isDirectory, s"unsupported runtime classpath entry: ${entry.getName}")
        val destination = output / f"$index%03d-${entry.getName}"
        if (entry.isDirectory) IO.copyDirectory(entry, destination)
        else IO.copyFile(entry, destination)
      }
      output
    },
  )
