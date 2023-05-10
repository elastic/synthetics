### Background

We have had to disable network throttling in Synthetics for browser based monitors. This is intended to be a temporary measure until we can release an update in the future to enable it again.

⚠️ please be aware that your monitors may run more quickly (i.e. have a lower duration) with network throttling disabled.


### Current status

* Elastic’s global managed testing infrastructure
  * Network throttling disabled in all locations from ~21:00 GMT 09 May 2023
  * All network throttling configurations defined for your monitors are ignored
* Private Locations (provided through Elastic Agent)
  * Versions prior to 8.8.0 have network throttling enabled (based on your monitor configuration)
  * Private Locations running on Elastic Agent from 8.8.0 onwards have network throttling disabled
    * All network throttling configurations defined for your monitors are ignored


### Changes

* ~21:00 GMT 09 May 2023 - network throttling disabled for all browser monitors running on Elastic’s global managed testing infrastructure

