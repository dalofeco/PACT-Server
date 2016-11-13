/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// AccuWeather API Key
var APIKEY =  "PSUHackathon112016";

/* IMPORTS */
var NaturalLanguageClassifierV1 = require('watson-developer-cloud/natural-language-classifier/v1');

var express = require('express');
var includes = require('array-includes');
var app = express();
var bodyParser = require("body-parser");
var Client = require("node-rest-client").Client;
var client = new Client();

app.use(bodyParser.urlencoded({
    extended: false,
}));

app.use(bodyParser.json());

// FOR TESTING PURPOSES *\
app.get('/', function(req, res) {
    getActivityClassifier("I want to go biking on saturday", 40.7934, -77.8600, res);
}) 

function getActivityClassifier(text, latitude, longitude, res) {
 
    var natural_language_classifier = new NaturalLanguageClassifierV1({
      username: '71e41afb-71f9-4bfb-9d07-e85fba2b2a2a',
      password: 'hpD7yI6cW3At'
    });
     
    natural_language_classifier.classify({
      text: text,
      classifier_id: '8aff06x106-nlc-13836' },
      function(err, response) {
        if (err)
          console.log('error:', err);
        else {
            var intents = response.top_class.split(',');
            getTimeClassifier(text, latitude, longitude, intents, res);
        }
    });
    
}

function getTimeClassifier(text, latitude, longitude, intents, res) {
    
    var natural_language_classifier = new NaturalLanguageClassifierV1({
      username: '074be669-5aa9-422a-a100-da2283315fae',
      password: 'EVVCeYLu7CTd'
    });
     
    natural_language_classifier.classify({
      text: text,
      classifier_id: 'f48968x109-nlc-5074' },
      function(err, response) {
        if (err)
          console.log('error:', err);
        else {
            var date = response.top_class;
            getLocationKey(latitude, longitude, intents, date, res);
        }
    });

}

app.post('/activity', function(req, res) {
    console.log(req.body);
    var clientData = req.body;
    var spokenText = clientData.text;
    var latitude = clientData.latitude;
    var longitude = clientData.longitude;
    getActivityClassifier(spokenText, latitude, longitude, res);
    // res.send(JSON.stringify(["3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"]));
});

// Function that gets location key for long, lat pair and calls getWeatherInfo with key
function getLocationKey(latitude, longitude, intent, date, res) {
    
    console.log(date)
    console.log(intent)
    
    /* Sends the index html page to the user */
    var locationKey = 0;
    var locationRequestURL = "http://apidev.accuweather.com/locations/v1/cities/geoposition/search.json?q=<LATLONG>&apikey=<APIKEY>&details=true&toplevel=false"
    
    // Construct formatted latitude longitude parameter string
    var latLongString = String(latitude) + ',' + String(longitude);
    
    // Replace location placeholder with parameter in URL
    locationRequestURL = locationRequestURL.replace(/<LATLONG>/, latLongString)
    locationRequestURL = locationRequestURL.replace(/<APIKEY>/, APIKEY)
    
    // Send request to AccuWeather API
    client.get(locationRequestURL, function(data, response) {
        // Get location key from JSON object
        locationKey = data.Key;
        getWeatherInfo(locationKey, intent, res, date);
    });
}

function getWeatherInfo(locationKey, intent, res, date) {
    
    var weatherForecastURL = "http://apidev.accuweather.com/forecasts/v1/hourly/<TIME>/<LATLONG>.json?apikey=<APIKEY>&details=true&metric=false";
    var timeRequest = '';
    
    weatherForecastURL = weatherForecastURL.replace(/<LATLONG>/, String(locationKey));
    weatherForecastURL = weatherForecastURL.replace(/<APIKEY>/, APIKEY);
    
    var todayDate = new Date().getDate();           //gets the day of month
    var dayOfWeek = new Date().getDay();            //gets the day of week 0-6
    var requestDate;
            
    //assigning day of week to each possible requested date string
    if(date == "tomorrow"){
        requestDate = (dayOfWeek + 1) % 7;
    }
    if(date == "today"){
        requestDate = dayOfWeek;
    }
    if(date == "Sunday"){
        requestDate = 0;
    }
    if(date == "Monday"){
        requestDate = 1;
    }
    if(date == "Tuesday"){
        requestDate = 2;
    }
    if(date == "Wednesday"){
        requestDate = 3;
    }
    if(date == "Thursday"){
        requestDate = 4;
    }
    if(date == "Friday"){
        requestDate = 5;
    }
    if(date == "Saturday"){
        requestDate = 6;
    }

    //calculating the date difference of the week 
    // If Day[date] is a value, date was specified by name (monday, tuesday, etc)
    if (requestDate != null) {
        // Find the difference b/w days
        var dateDiff = requestDate - dayOfWeek;
        if (dateDiff < 0)
            dateDiff += 7;
    }


    //calculating the day that the user wants to schedule an activity
    var newDate = dateDiff + todayDate;

    //finding out what API to use. Specifically how many hours of weather will be needed
    var APIHOURS
    if(dateDiff == 0){ APIHOURS = 24}
    else if(dateDiff == 1 || dateDiff == 2){ APIHOURS = 72}
    else if(dateDiff == 3 || dateDiff == 4 || dateDiff == 5){ APIHOURS = 120}
    else {   // More than five days in advance is not supported

        res.send([{timeString: "You can only schedule up to five days in advance!", time: -1}]);
        return;
    }


    //appending the URL to contain correct total hours needed
    weatherForecastURL = weatherForecastURL.replace(/<TIME>/, String(APIHOURS) + 'hour')

    client.get(weatherForecastURL, function(data, response) {
        var hourlyForecast = [];
        
        for (var i = 0; i < data.length; i++) {
            var forecast = {}
            forecast.temperature = data[i].Temperature.Value;
            forecast.windSpeed = data[i].Wind.Speed.Value;
            forecast.realFeel = data[i].RealFeelTemperature.Value;
            forecast.seenVisibility = data[i].Visibility.Value;
            forecast.probablities = {
                snow: data[i].SnowProbability,
                rain: data[i].RainProbability,
                ice: data[i].IceProbability,
                precipitation: data[i].PrecipitationProbability
            };
            forecast.onGround = {
                snow: data[i].Snow.Value,
                ice: data[i].Ice.Value,
                rain: data[i].Rain.Value,
                totalLiquid: data[i].TotalLiquid.Value
            }
        
            var date = new Date(data[i].EpochDateTime*1000);
            forecast.time = {
                seconds: date.getSeconds(),
                minutes: date.getMinutes(),
                hours: date.getHours(),
                weekday: date.getDay(),
                monthday: date.getDate(),
                year: date.getFullYear(),
                month: date.getMonth()
            } 
            //Checking to see when the needed date is in array. If so then capture each hour forecast in that day
            if(forecast.time.monthday == newDate){
                hourlyForecast.push(forecast);
            }
        }
        
        var rankedForecasts = [];

        //SUMMER
        var RAIN = "There is a high chance of rain all day."
        var TEMP = "Extreme temperatures all day long. Exercise caution."
        var noRain = 0; var extremeTemp = 0;
        if (includes(intent, 'summer')) {
            var acceptableForecast = []
            for (var i = 0; i < hourlyForecast.length; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 3 && hourlyForecast[i].time.hours <= 23) {
                    // Check hours with no rain probablities
                    if (hourlyForecast[i].probablities.rain < 37) {
                        noRain++
                        // Check temperature min and max
                        if (hourlyForecast[i].temperature > 40 && hourlyForecast[i].temperature < 90) {
                            extremeTemp++
                            acceptableForecast.push(hourlyForecast[i])
                        }
                    }
                }
            }
            
            if (noRain == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = RAIN
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }
            if (extremeTemp == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = TEMP
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }
           rankedForecasts = summerRank(acceptableForecast);
        }

        // WINTER
        var NOSNOW = "There is not enough snow to enjoy this activity."
        var TEMP = "Temperature is not optimal for this activity today."
        var noSnow = 0; var temp = 0;
        if (includes(intent, 'winter')){
            //consider temp, snow, snow probability, wind, windchill
            var acceptableForecast = []
            for (var i = 0; i < hourlyForecast.length; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 7 && hourlyForecast[i].time.hours <= 22) {
                    //Check for acceptable cold temperature
                    if (hourlyForecast[i].temperature < 40 && hourlyForecast[i].temperature > 20){
                        temp++
                        //Check for snowfall in inches
                        if (hourlyForecast[i].onGround.snow > 3){
                            noSnow++
                            //Check for wind chill
                            if (hourlyForecast[i].realFeel < 40 && hourlyForecast[i].realFeel > 15) {
                                acceptableForecast.push(hourlyForecast[i]);
                            }   
                        }   
                    }   
                }  
                
            }

            if(noSnow == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = NOSNOW
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }
            if(temp == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = TEMP
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }
             // End FOR loop
            //Then rank, based on snow chances, temperature, realfeel 
            rankedForecasts = winterRank(acceptableForecast);
        }

        var VIS = "Bad visibility all day. Maybe choose another activity."
        var WIND = "High winds all day. Maybe choose another activity."
        var vis = 0, wind = 0;
        if (includes(intent, 'visibility')) {
            // for sports that need good visibility
            var acceptableForecast = []
            for (var i = 0; i < hourlyForecast.length; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 7 && hourlyForecast[i].time.hours <= 22) {
                    //Checking for visibility
                    if (hourlyForecast[i].seenVisibility > 1){
                        vis++
                       //Checking for extreme winds
                        if (hourlyForecast[i].windSpeed < 10){
                            wind++;
                            acceptableForecast.push(hourlyForecast[i]);
                        }   
                    }  
                }   
            }
            if(vis == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = VIS
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }
            if(wind == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = WIND
                result.push(pebbleResult)
                res.send(JSON.stringify(result)); return
            }

            rankedForecasts = visibilityRank(acceptableForecast);
        }
        rankedForecasts = sortThis(rankedForecasts);
        sendTopResultsToWatch(rankedForecasts, res);
    });
}

// Send results to the watch via HTTP Request
function sendTopResultsToWatch(rankedResults, res) {
    var amPm = "AM";
    // Send X amount of results back to the watch
    var numOfResults = 3
    
    // If less than three results, only send the results available
    if (rankedResults.length < numOfResults)
        numOfResults = rankedResults.length;
        
    var results = [];
    for (var i = 0; i < numOfResults; i++) {
        var pebbleResult = {}
        if (rankedResults[i].time.hours > 11) {
            amPm = "PM";
        }
        if (rankedResults[i].time.hours == 0) {
            pebbleResult.time = 12;
        } 
        else { 
            pebbleResult.time = rankedResults[i].time.hours}
        
        pebbleResult.timeString = String(pebbleResult.time % 12) + ":00 " + amPm;
        
        if (rankedResults[i].time.weekday == 0) 
            pebbleResult.day = 'Sunday';
        else if (rankedResults[i].time.weekday == 1)
            pebbleResult.day = 'Monday'
        else if (rankedResults[i].time.weekday == 2)
            pebbleResult.day = 'Tuesday'
        else if (rankedResults[i].time.weekday == 3)
            pebbleResult.day = 'Wednesday'
        else if (rankedResults[i].time.weekday == 4)
            pebbleResult.day = 'Thursday'
        else if (rankedResults[i].time.weekday == 5)
            pebbleResult.day = 'Friday'
        else if (rankedResults[i].time.weekday == 6)
            pebbleResult.day = 'Saturday'
        
        results.push(pebbleResult);
    }
    console.log(results)
    res.send(JSON.stringify(results))
}

// ************************* \\
// **** RANKING METHODS **** \\
// ************************* \\

function sortThis(acceptableForecast) {
    acceptableForecast.sort(function(a,b) {
        var aRank = 0;
        var bRank = 0;
        var weight = 0;
        var aRanking = 0;
        var bRanking = 0;
        var visibility = false;
        var summer = false;
        var winter = false;
        
        if (a.visibilityRank && b.visibilityRank) {
            weight += 1
            visibility = true;
        }
        
        if (a.summerRank && b.summerRank) {
            weight += 1
            summer = true;
        }
        
        if (a.winterRank && b.winterRank) {
            weight += 1
            winter = true;
        }
        
        if (visibility) {
            aRanking += (a.visibilityRank/weight)
            bRanking += (b.visibilityRank/weight)
        }
        
        if (summer) {
            aRanking += (a.summerRank/weight)
            bRanking += (b.summerRank/weight)
        }
        
        if (winter) {
            aRanking += (a.winterRank/weight)
            bRanking += (b.winterRank/weight)
        }
        
        return bRanking - aRanking;
    });
    
    return acceptableForecast;
}

function winterRank(acceptableForecast) {
    var IDEAL_TEMP = 28
    var MAX_TEMP_DIFFERENCE = 13
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - IDEAL_TEMP))/MAX_TEMP_DIFFERENCE
        var snowChangeWeight = 0.5 * (Math.abs(100-acceptableForecast[i].probablities.snow))/100;
        
        acceptableForecast[i].winterRank = tempWeight + snowChangeWeight;
        
        if (acceptableForecast[i].winterRank > 1)
            console.log("Something is very wrong.");
    }
    
    return acceptableForecast;
}

function summerRank(acceptableForecast) {
    var IDEAL_RAIN_PERC = 37
    var MAX_TEMP_DIFFERENCE = 25
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var rainWeight = 0.5 * (Math.abs(acceptableForecast[i].probablities.rain/ IDEAL_RAIN_PERC));
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - 65))/MAX_TEMP_DIFFERENCE;
        
        acceptableForecast[i].summerRank = tempWeight + rainWeight;
        
        if (acceptableForecast[i].summerRank > 1)
            console.log("Something is very wrong.");
    }
    
    return acceptableForecast;
}

function visibilityRank(acceptableForecast) {
    var VISIBILITY_MILES = 1
    var WIND_SPEED = 10
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var visWeight = 0.5 * (Math.abs(acceptableForecast[i].seenVisibility/ VISIBILITY_MILES));
        var windWeight = 0.5 * (Math.abs(acceptableForecast[i].windSpeed))/WIND_SPEED;
        
        acceptableForecast[i].visibilityRank = visWeight + windWeight;
        
        if (acceptableForecast[i].visibilityRank > 1)
            console.log("Something is very wrong.");
    }
    
    return acceptableForecast;
}


var port = (process.env.VCAP_APP_PORT || 8080);
var host = (process.env.VCAP_APP_HOST || 'localhost');

// start server on the specified port and binding host
app.listen(port, host, function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

