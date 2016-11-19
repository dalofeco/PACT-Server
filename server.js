// ***** CONSTANTS ***** \\
// AccuWeather API Key
const ACCUWEATHER_APIKEY =  "k8GCzfGSugLwsLoBLpzW5veMAoMmFzL8";

// TimeZone Offset
var TIMEZONE_OFFSET = -5; // FOR -5 EST daylight saving timezone

// ************************ \\
// ******* MODULES ******** \\
// ************************ \\
// IBM Watson Natural Language Classifier
var NaturalLanguageClassifierV1 = require('watson-developer-cloud/natural-language-classifier/v1');

// Google APIs
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var calendar = google.calendar('v3');


// File Management
var fs = require('fs');

// Server Request Handling
var express = require('express');
var app = express();
var includes = require('array-includes');
var bodyParser = require("body-parser");

// REST Client for Server API calls
var Client = require("node-rest-client").Client;
var client = new Client();

// Parse url encoded parameters automatically
app.use(bodyParser.urlencoded({
    extended: false,
}));

// Automatically parse json bodies
app.use(bodyParser.json());

// **** END OF MODULES ***** //

app.get('/', function(req, res) {
    getActivityClassifier("I want to play soccer wednesday night", 35.2008, 35.2999, res);
}) 

// Get request for browser testing of functionality
app.get('/activ', function(req, res) {
    var intent = req.query.intent;
    var latitude = req.query.latitude;
    var longitude = req.query.longitude;
    getActivityClassifier(intent, latitude, longitude, res);
});

// Handle POST request to schedule activity
app.post('/activity', function(req, res) {
    var clientData = req.body;
    var spokenText = clientData.text;
    var latitude = clientData.latitude;
    var longitude = clientData.longitude;
    getActivityClassifier(spokenText, latitude, longitude, res);
    // res.send(JSON.stringify(["3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"]));
});

// *********************************************** \\
// *** IBM WATSON NATURAL LANGUAGE CLASSIFIERS *** \\
// *********************************************** \\

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
            getTimeOfDayClassifier(text, latitude, longitude, intents, res);
        }
    });
    
}

function getTimeOfDayClassifier(text, latitude, longitude, intents, res) {
    var natural_language_classifier = new NaturalLanguageClassifierV1({
      username: '2e0fc033-ff15-476b-8f55-ae53aa4b1620',
      password: 'Dl8vvqQA3TNg'
    });
     
    natural_language_classifier.classify({
      text: text,
      classifier_id: '004a12x110-nlc-3402' },
      function(err, response) {
        if (err)
          console.log('error:', err);
        else {
            var timeClass = response.top_class;
            var timeOfDay = null;
            var acceptableClasses = ['Morning', 'Afternoon', 'Evening', 'Now']
            
            if (includes(acceptableClasses, response.top_class)) {
                for (var i = 0; i < acceptableClasses.length; i++) {
                    if (response.classes[i].confidence > 0.70) {
                        if (timeClass == 'Now') {
                            var currentDate = new Date(new Date().getTime() + TIMEZONE_OFFSET * 3600 * 1000); // Yes, kinda sketchy, but gets current time zone with offset
                            timeOfDay = currentDate.getHours();
                            console.log(timeOfDay);
                        }
                        else if (timeClass == 'Morning')
                            timeOfDay = 9;
                        else if (timeClass == 'Afternoon')
                            timeOfDay = 14;
                        else if (timeClass == 'Evening')
                            timeOfDay = 19;
                        else {
                            console.log("Something went really wrong; time of day class is not compatible.")
                            timeOfDay = 12;
                        }
                    }
                }
            }
            
            getTimeClassifier(text, latitude, longitude, intents, res, timeOfDay);
        }
    });
}

function getTimeClassifier(text, latitude, longitude, intents, res, timeOfDay) {
    
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
            getLocationKey(latitude, longitude, intents, date, res, timeOfDay);
        }
    });

}

// Function that gets location key for long, lat pair and calls getWeatherInfo with key
function getLocationKey(latitude, longitude, intent, date, res, timeOfDay) {
    
    console.log(date)
    console.log(intent)
    console.log(timeOfDay)
    
    /* Sends the index html page to the user */
    var locationKey = 0;
    var locationRequestURL = "http://api.accuweather.com/locations/v1/cities/geoposition/search.json?q=<LATLONG>&apikey=<APIKEY>&details=true&toplevel=false"
    // Construct formatted latitude longitude parameter string
    var latLongString = String(latitude) + ',' + String(longitude);
    
    // Replace location placeholder with parameter in URL
    locationRequestURL = locationRequestURL.replace(/<LATLONG>/, latLongString)
    locationRequestURL = locationRequestURL.replace(/<APIKEY>/, ACCUWEATHER_APIKEY)

    console.log(locationRequestURL);
    
    // Send request to AccuWeather API
    client.get(locationRequestURL, function(data, response) {
        // Check for API authorization issues
        if (response.statusCode == 403) {
            console.log('Accuweather API Authorization Failure');
            return
        }
        // Get location key from JSON object
        locationKey = data.Key;
        getWeatherInfo(locationKey, intent, res, date, timeOfDay);
    });
}

function getWeatherInfo(locationKey, intent, res, date, timeOfDay) {
    
    var weatherForecastURL = "http://api.accuweather.com/forecasts/v1/hourly/<TIME>/<LATLONG>.json?apikey=<APIKEY>&details=true&metric=false";
    var timeRequest = '';
    
    weatherForecastURL = weatherForecastURL.replace(/<LATLONG>/, String(locationKey));
    weatherForecastURL = weatherForecastURL.replace(/<APIKEY>/, ACCUWEATHER_APIKEY);
    
    var dateObject = new Date(new Date().getTime() + TIMEZONE_OFFSET * 3600 * 1000); // Yes, kinda sketchy, but gets current time zone with offset
                                                    //  offset (-12-12) (seconds in hr) * (1000) -> milliseconds
    var todayDate = dateObject.getDate();           //gets the day of month
    var dayOfWeek = dateObject.getDay();            //gets the day of week 0-6
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
    console.log(requestDate);

    //calculating the date difference of the week 
    var dateDiff;
    if (requestDate != null) {
        // Find the difference b/w days
        dateDiff = requestDate - dayOfWeek;
        if (dateDiff < 0)
            dateDiff += 7;
    } else
        console.log("requestDate is null: line ~203")

    //calculating the day that the user wants to schedule an activity
    var newDate = dateDiff + todayDate;

    //finding out how long to request weather date for, specifically how many hours of weather will be needed
    var APIHOURS;
    if(dateDiff == 0) { 
        APIHOURS = 24;
        
    } else if(dateDiff == 1 || dateDiff == 2) { 
        APIHOURS = 72;
        
    } else if (dateDiff == 3 || dateDiff == 4 || dateDiff == 5) {
        APIHOURS = 120;
        
    } else {
        // More than five days in advance is not supported
        res.send([{timeString: "You can only schedule up to five days in advance!", time: -1}]);
        return;
    }

    //appending the URL to contain correct total hours needed
    weatherForecastURL = weatherForecastURL.replace(/<TIME>/, String(APIHOURS) + 'hour')
    console.log(weatherForecastURL);
    client.get(weatherForecastURL, function(data, response) {
        var hourlyForecast = [];
        if (response.statusCode == 403) {
            console.log('Accuweather API Authorization Failure');
            return
        }
        
        // Store all the fetched data
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
        
            var date = new Date((data[i].EpochDateTime-18000)*1000);
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
        } // finished fetching data
        
        
        // Define function to validate forecasts
        function validForecast(forecast, res) {
            // Assume forecast is valid 
            var returnValue = true;
            
            // If empty, not valid
            if (forecast.length == 0) {
               returnValue = false;
            // If time is -1, it is an error message, so send back
            } else if (forecast.time == -1) {
               res.send(JSON.stringify(forecast));
               returnValue = false;
            }
            return returnValue;
        }
        
            
        //SUMMER
        var sForecast = summerForecast(hourlyForecast, intent);
        if (!validForecast(sForecast, res)) {
           sForecast = hourlyForecast; // fill in with all original values
        }
    
        // WINTER
        var wsForecast = winterForecast(sForecast, intent);
        if (!validForecast(wsForecast, res)) {
           wsForecast = sForecast; // fill in with all previous values
        }
       
        // VISIBILITY
        var vwsForecast = visibilityForecast(wsForecast, intent);
        if (!validForecast(vwsForecast, res)) {
           vwsForecast = wsForecast; // fill in with all previous values
        }
       
        // TIME (Doesn''t need checking, always returns all elements)
        var tvwsForecast = timeRank(vwsForecast, timeOfDay);
       
        // Sort the forecasts with rankings
        var rankedForecasts = sortThis(tvwsForecast);
        
        // Send the top results to pebble watch
        sendTopResults(rankedForecasts, res);
    });
}

// Send results to the watch via HTTP Request
function sendTopResults(rankedResults, res) {
    // Send X amount of results back to the watch
    var numOfResults = 3
    
    // If less than three results, only send the results available
    if (rankedResults.length < numOfResults)
        numOfResults = rankedResults.length;
        
    var results = [];
    for (var i = 0; i < numOfResults; i++) {
        var amPm = 'AM'; // assume AM before check
        var pebbleResult = {}
        if (rankedResults[i].time.hours > 11) {
            amPm = "PM";
        }
        if (rankedResults[i].time.hours == 0) {
            pebbleResult.time = 12;
        } 
        else { 
            pebbleResult.time = rankedResults[i].time.hours}
        var hours;
        
        if (pebbleResult.time == 12)
            hours = String(pebbleResult.time)
        else
            hours = String(pebbleResult.time % 12)
        
        pebbleResult.timeString = hours + ":00 " + amPm;
        
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

// ***************************************** \\
// **** RANKING and FORECASTING METHODS **** \\
// ***************************************** \\

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
        var time = false;
        
        var visibilityWeight = 2;
        var summerWeight = 2;
        var winterWeight = 2;
        var timeWeight = 3;
        
        if (a.visibilityRank && b.visibilityRank) {
            weight += visibilityWeight;
            visibility = true;
        }
        
        if (a.summerRank && b.summerRank) {
            weight += summerWeight;
            summer = true;
        }
        
        if (a.winterRank && b.winterRank) {
            weight += winterWeight;
            winter = true;
        }
        
        if (a.timeRank && b.timeRank) {
            weight += timeWeight;
            time = true;
        }
        
        if (visibility) {
            aRanking += (a.visibilityRank/weight) * visibilityWeight;
            bRanking += (b.visibilityRank/weight) * visibilityWeight;
        }
        
        if (summer) {
            aRanking += (a.summerRank/weight) * summerWeight;
            bRanking += (b.summerRank/weight) * summerWeight;
        }
        
        if (winter) {
            aRanking += (a.winterRank/weight) * winterWeight;
            bRanking += (b.winterRank/weight) * winterWeight;
        }
        
        if (time) {
            aRanking += (a.timeRank/weight) * timeWeight;
            bRanking += (b.timeRank/weight) * timeWeight;
        }
        
        return aRanking - bRanking;
    });
    
    return acceptableForecast;
}

function visibilityForecast(forecastsToUse, intent) {
    
        var VIS = "Bad visibility all day. Maybe choose another activity."
        var WIND = "High winds all day. Maybe choose another activity."
        var vis = 0
        var wind = 0;
        var acceptableForecast = []
        
        if (includes(intent, 'visibility')) {
            // for sports that need good visibility
            for (var i = 0; i < forecastsToUse.length; i++) {
                // Check within acceptable time 
                if (forecastsToUse[i].time.hours > 7 && forecastsToUse[i].time.hours <= 22) {
                    //Checking for visibility
                    if (forecastsToUse[i].seenVisibility > 1){
                        vis++
                       //Checking for extreme winds
                        if (forecastsToUse[i].windSpeed < 10){
                            wind++;
                            if (!includes(acceptableForecast, forecastsToUse[i]))
                                acceptableForecast.push(forecastsToUse[i]);
                        }   
                    }  
                }   
            }
            if (vis == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = VIS
                result.push(pebbleResult)
                acceptableForecast = result;
            }
            else if (wind == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = WIND
                result.push(pebbleResult)
                acceptableForecast = result
            } else {
                acceptableForecast = visibilityRank(acceptableForecast);
            }
        }
        return acceptableForecast
}

function winterRank(acceptableForecast) {
    var IDEAL_TEMP = 28
    var MAX_TEMP_DIFFERENCE = 13
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - IDEAL_TEMP))/MAX_TEMP_DIFFERENCE
        var snowChangeWeight = 0.5 * (Math.abs(100-acceptableForecast[i].probablities.snow))/100;
        
        acceptableForecast[i]["winterRank"] = tempWeight + snowChangeWeight;
        
        if (acceptableForecast[i].winterRank > 1)
            console.log("Something is very wrong.");
    }
    return acceptableForecast;
}

function winterForecast(hourlyForecast, intent) {
        var NOSNOW = "Not Enough Info."
        var TEMP = "Temperature is not optimal for this activity today."
        var noSnow = 0; var temp = 0;
        var acceptableForecast = []
        
        if (includes(intent, 'winter')){
            //consider temp, snow, snow probability, wind, windchill
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

            if (!noSnow){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = NOSNOW
                result.push(pebbleResult)
                acceptableForecast = result;
                
            } else if(!temp){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = TEMP
                result.push(pebbleResult)
                acceptableForecast = result;
            } else {
                acceptableForecast = winterRank(acceptableForecast);
            }
        }
    return acceptableForecast
}


function summerForecast(hourlyForecast, intent) {
        var RAIN = "There is a high chance of rain all day."
        var TEMP = "Extreme temperatures all day long. Exercise caution."
        var noRain = 0; 
        var extremeTemp = 0;
        var acceptableForecast = []
        
        if (includes(intent, 'summer')) {
            
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
                acceptableForecast = result;
            }
            else if (extremeTemp == 0){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = TEMP
                result.push(pebbleResult)
                acceptableForecast = result;
            } else {
                acceptableForecast = summerRank(acceptableForecast);
            }
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

function timeRank(acceptableForecast, timePreference) {
    for (var i = 0; i < acceptableForecast.length; i++) {
        var timeWeight = Math.abs(acceptableForecast[i].time.hours-timePreference)/24;
        acceptableForecast[i].timeRank = timeWeight;
    }
    return acceptableForecast;
}

// ********************** \\
// **** CLIENT DATA ***** \\
// ********************** \\

// Store active clients info
var CLIENTS = {}
loadClients();

// Load client info from file store
function loadClients() {
    fs.readFile('../.credentials/clients.json', function(err, data) {
        if (err)
            console.log(err)
        else if (data != '')
            CLIENTS = JSON.parse(data);
    });
}

// Save client info to file store
function saveClients() {
    fs.writeFile('../.credentials/clients.json', JSON.stringify(CLIENTS), function(err) {
        if (err)
            console.log(err);
        else 
            console.log('Saved file store');
    });
}

// To store new registering clients
var NEW_CLIENTS = {}
// To store generated ids awaiting Google API connecition
var PENDING_IDS = []

// Provide access to genereate unique id for registration
app.get('/genID', function(req, res) {
    var id = generateNewPactID();
    res.send(id);
});

function generateNewPactID(res) {
// Generates a unique pact ID and adds it to pending ids (for user registration)
// Input: response object from user http request
// Output: unique pact ID string
    var again = true;
        
    while(again) { // To make sure no duplicate ID is generated
        var newID = Math.random().toString(36).substr(2, 8);
        if (CLIENTS[newID] != null)
            again = true;
        else 
            again = false;
    }
    PENDING_IDS.push(newID);
    
    return newID;
}

// Provide the pact registration page
app.get('/register', function(req, res) {
    res.sendFile(__dirname + '/register.html');
})

// Handle user request to register form information
app.post('/register', function(req, res) {
    var email = req.body.email;
    var pactID = req.body.pactid;
    if (email && pactID) {
        if (includes(PENDING_IDS, pactID)) {
            NEW_CLIENTS[email] = {'email': email, 'pactID': pactID}
            registerTokenForPact(pactID, res);
        } else
            res.send('Invalid ID!');
    }
});

// ************************************************ \\
// ********** EVERTHING GOOGLE APIS *************** \\
// ************************************************ \\

// If modifying these scopes, delete your previously saved credentials

var GOOGLE_API_SCOPES = ['https://www.googleapis.com/auth/calendar', 
                         'https://www.googleapis.com/auth/plus.login',
                         'email'];

// GET Request with GOOGLE USER AUTHENTICATION CODE
app.get('/googleAuth', function(req, res) {
    //res.sendFile(__dirname + '/success.html')
    var code = req.query.code;
    console.log(code)
    if (code) {

        // Load client secrets from a local file.
        fs.readFile('client_secret.json', function processClientSecrets(err, content) {
            if (err) {
                console.log('Error loading client secret file: ' + err);
                return;
            }
            
            var credentials = JSON.parse(content);
            var clientSecret = credentials.web.client_secret;
            var clientId = credentials.web.client_id;
            var redirectUrl = credentials.web.redirect_uris[2];
            var auth = new googleAuth();
            var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
            
        
            oauth2Client.getToken(code, function(err, token) {
                if (err) {
                    console.log('Error while trying to retrieve access token', err);
                    return;
                }
                
                oauth2Client.credentials = token;
                // Get the PactID and store it with PactID in filename
                getClientPactIdAndStore(oauth2Client, token);
            });
        
        });
    }
});
                         
function registerTokenForPact(pactID, res) {
    var token_dir = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
    var token_path = token_dir + 'goo-api-tok-' + pactID + '.json';
    
    fs.readFile('client_secret.json', function processClientSecrets(err, content) {
      if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
      }
      // Authorize a client with the loaded credentials, then call the callback
      register(JSON.parse(content), token_path, res);
    });
}

function register(credentials, token_path, res) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[2];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(token_path, function(err, token) {
        if (err) {
            generateNewToken(oauth2Client, res);
        }
        else {
            oauth2Client.credentials = JSON.parse(token);
            console.log("User already registered!");
        }
    });
}

function generateNewToken(oauth2Client, res) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_API_SCOPES
    });
    res.redirect(authUrl);
}


function getTokenForPact(pactID, callback, param) {

    var token_dir = (process.env.HOME || process.env.HOMEPATH ||
        process.env.USERPROFILE) + '/.credentials/';
    var token_path = token_dir + 'goo-api-tok-' + pactID + '.json';
    
    // Load client secrets from a local file.
    fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }
    // Authorize a client with the loaded credentials, then call the callback
    if (param)
        authorize(JSON.parse(content), callback, token_path, pactID, param);
    else
        authorize(JSON.parse(content), callback, token_path, pactID);
    });
}
/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, token_path, pactID, param) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[2];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(token_path, function(err, token) {
        if (err) {
            console.log("User must register first!")
        } else {
            oauth2Client.credentials = JSON.parse(token);
            if (param)
                callback(oauth2Client, param);
            else
                callback(oauth2Client);
        }
    });
}

function getClientPactIdAndStore(oauth2Client, token) {
    var plus = google.plus('v1');
    var request = plus.people.get({
        'userId' : 'me',
        'fields': 'emails',
        'auth': oauth2Client,
    }, function(err, response) {
        if (err) {
            console.log(err)
            return
        }
        else {
            var email = response.emails[0].value;
            var pactID = NEW_CLIENTS[email].pactID;
            console.log(pactID)
            console.log(NEW_CLIENTS)
            NEW_CLIENTS[email] = null; // delete pending registering user once it is processed
            
            if (pactID == null)
                console.log("Couldn't retrieve local pact id from NEW_CLIENTS")
            else
                storeToken(token, pactID, email);
        }
    });
}

function generateTokenPath(pactID) {
    var token_dir = (process.env.HOME || process.env.HOMEPATH ||
        process.env.USERPROFILE) + '/.credentials/';
     return token_dir + 'goo-api-tok-' + pactID + '.json';
}


function deleteTokenForPactID(pactID) {
    if (pactID) {
        if (CLIENTS[pactID] != null) {
            var email = CLIENTS[pactID].email;
            delete CLIENTS[pactID];
            fs.unlink(generateTokenPath(pactID));
            console.log('Successfully deleted all data for ' + pactID + '(' + email + ')');
        }
    }
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token, pactID, email) {
    var token_dir = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
    var token_path = token_dir + 'goo-api-tok-' + pactID + '.json';
    
    try {
        fs.mkdirSync(token_dir);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    
    fs.writeFile(token_path, JSON.stringify(token));
    var client = { 'id': pactID,
                    'email': email };
                    
    CLIENTS[pactID] = client;
    saveClients();
    
    console.log('Token stored to ' + token_path);
}

app.get('/list', function(req, res) {
    if (req.query.pactID) {
        var pactID = req.query.pactID;
        getTokenForPact(pactID, listEvents);
    }
});

app.get('/delete', function(req, res) {
    if (req.query.pactID) {
        deleteTokenForPactID(req.query.pactID);
    }
})

function getUserSchedule(pactID) {
    // If pactID's calendar was updated more than fifteen minutes ago
    if ((new Date().getTime() - CLIENTS[pactID].updateTime) > (900 * 1000)) {
        // get user schedule and store it to CLIENTS[pactID].schedule[]
        getTokenForPact(pactID, fetchEvents, pactID)
    }
}

/**
 * Fetches the next 10 events on the user's primary calendar and saves locally
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client. and a registered pactID string
 */
function fetchEvents(auth, pactID) {
    calendar.events.list({
        auth: auth,
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime'
    }, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var events = response.items;
        if (events.length == 0) {
            console.log('No upcoming events found.');
        } else {
            console.log('Upcoming 10 events:');
            for (var i = 0; i < events.length; i++) {
                var event = {
                    'start': events[i].start.dateTime,
                    'end': events[i].end.dateTime,
                    'title': events[i].summary,
                    'timeZone': events[i].start.timeZone
                }
                CLIENTS[pactID].schedule.push(event);
            }
            console.log(CLIENTS[pactID]);
        }
    });
}


// Boilerplate code for creating a new event
function createEvent(auth, eventDetails) {
    var event = {
        'summary': eventDetails.title,
        'location': '800 Howard St., San Francisco, CA 94103',
        'description': 'A chance to hear more about Google\'s developer products.',
        'start': {
            'dateTime': eventDetails.startTime, //'2015-05-28T09:00:00-07:00',
            'timeZone': eventDetails.timeZone, //'America/Los_Angeles',
        },
        'end': {
            'dateTime': eventDetails.endTime,
            'timeZone': eventDetails.timeZone,
        },
        // 'recurrence': ['RRULE:FREQ=DAILY;COUNT=2'],
        //'attendees': [ 
        //    {'email': 'lpage@example.com'},
        //    {'email': 'sbrin@example.com'},
       // ],
        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'email', 'minutes': 30},
                {'method': 'popup', 'minutes': 20},
            ],
        },
    };
    
    calendar.events.insert({
      auth: auth,
      calendarId: 'primary',
      resource: event,
    }, function(err, event) {
      if (err) {
        console.log('There was an error contacting the Calendar service: ' + err);
        return;
      }
      console.log('Event created: %s', event.htmlLink);
    });
}

// ***** END OF GOOGLE APIS ***** \\
// ****************************** \\

// Open up the server to listen for incoming connections
var server = app.listen(process.env.PORT || '8080', '0.0.0.0', function() {
    if(process.env.PORT){
        console.log('https://www.' + process.env.C9_HOSTNAME)
    } else {
        console.log('App listening at http://%s:%s', server.address().address, server.address().port);
    }
});


