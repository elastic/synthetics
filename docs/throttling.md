### Network throttling in Elastic Synthetics

We have disabled network throttling in Synthetics for browser-based monitors. This is a temporary measure and throttling will become available in a future update.

⚠️ With network throttling being disabled, note that your monitors may run more quickly (i.e. have a lower duration) than you observed previously, and when network throttling is enabled again in the future.


### Current status

* Elastic’s global managed testing infrastructure
  * Network throttling disabled for all locations from ~21:00 GMT 09 May 2023
  * All network throttling configurations defined for your monitors are ignored
* Private Locations (provided through Elastic Agent)
  * Versions prior to 8.8.0 have network throttling enabled (based on your monitor configuration)
  * Private Locations running on Elastic Agent from 8.8.0 onwards have network throttling disabled
    * All network throttling configurations defined for your monitors are ignored


### Changes

* ~21:00 GMT 09 May 2023 - Network throttling disabled for all browser monitors running on Elastic’s global managed testing infrastructure

