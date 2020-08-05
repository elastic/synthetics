let state = {
    journeys: [],
    currentJourney: null
}

function journey(options, callback) {
    state.journeys.push({
        options,
        callback,
        steps: []
    })
}

function step(name, callback) {
    state.currentJourney.steps.push({ name, callback })
}


module.exports = {
    journey,
    step,
    state
}