// ***** CONSTANTS ***** \\

// TimeZone Offset
const TIMEZONE_OFFSET = -5; // FOR -5 EST daylight saving timezone

process.env.TZ = 'America/New York'

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

// API Keys
const WUNDERGROUND_APIKEY = JSON.parse(fs.readFileSync('apikeys.json', 'utf8')).WUNDERGROUND_APIKEY;

// Asynchronous Package
var async = require('async');

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


// ** SERVER REQUEST HANDLING ** \\

app.get('/', function(req, res) {
    // initiateActivityRequest("I want to play soccer sunday at noon", 35.2008, 35.2999, res);
    initiateActivityRequest("I want to play soccer tomorrow afternoon", 25.793436, -80.244739, res);
}) 

// Get request for browser testing of functionality
app.get('/activ', function(req, res) {
    var intent = req.query.intent;
    var latitude = req.query.latitude;
    var longitude = req.query.longitude;
    initiateActivityRequest(intent, latitude, longitude, res);
});

// Handle POST request to schedule activity
app.post('/activity', function(req, res) {
    var clientData = req.body;
    var spokenText = clientData.text;
    var latitude = clientData.latitude;
    var longitude = clientData.longitude;
    initiateActivityRequest(spokenText, latitude, longitude, res);
    // res.send(JSON.stringify(["3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"]));
});

// Send results to the Pebble watch via HTTP Request
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

function initiateActivityRequest(text, latitude, longitude, res) {    
    async.waterfall([
        function(callback) {
            var intent = getActivityClassifier(text, callback);
        },
        function(intent, callback) {
            var timeOfDay = getTimeOfDayClassifier(text, intent, callback);
        },
        function(intent, timeOfDay, callback) {
            var date = getTimeClassifier(text, intent, timeOfDay, callback);
        },        
        function(intent, timeOfDay, date, callback) {
            var weatherForecastURL = generateWeatherRequestURL(latitude, longitude, date);
            callback(null, intent, timeOfDay, date, weatherForecastURL);
        },
        function(intent, timeOfDay, date, weatherForecastURL, callback) {
            client.get(weatherForecastURL, function(data, response) {
                var hourlyForecast = [];
                if (response.statusCode == 403) {
                    console.log('Wunderground API Authorization Failure');
                    return
                }

                // Store all the fetched data
                for (var i = 0; i < data.hourly_forecast.length; i++) {
                    var forecast = {}
                    forecast.temperature = data.hourly_forecast[i].temp.metric;
                    forecast.feelsLike = data.hourly_forecast[i].feelslike.metric;

                    forecast.heatIndex = data.hourly_forecast[i].heatindex.metric;
                    forecast.windChill = data.hourly_forecast[i].windchill.metric;

                    forecast.windSpeed = data.hourly_forecast[i].wspd.metric;
                    forecast.humidity = data.hourly_forecast[i].humidity; // in percentage
                    forecast.uvi = data.hourly_forecast[i].uvi; // ultra violet index
                    forecast.qpf = data.hourly_forecast[i].qpf.metric; // quantitative precipitaiton forecast 
                    forecast.dewpoint = data.hourly_forecast[i].dewpoint.metric;
                    forecast.snow = data.hourly_forecast[i].snow.metric;
                    forecast.mslp = data.hourly_forecast[i].mslp.metric;
                    forecast.pop = data.hourly_forecast[i].pop;


                    forecast.time = {
                        seconds: data.hourly_forecast[i].FCTTIME.sec,
                        minutes: data.hourly_forecast[i].FCTTIME.min,
                        hours: data.hourly_forecast[i].FCTTIME.hour,
                        monthday: data.hourly_forecast[i].FCTTIME.mday,
                        year: data.hourly_forecast[i].FCTTIME.year,
                        month: data.hourly_forecast[i].FCTTIME.mon,
                        weekday: data.hourly_forecast[i].FCTTIME.weekday_name
                    } 
                    
                    var dateObject = new Date();
                    var todayDate = dateObject.getDate();           //gets the day of month
                    var dayOfWeek = dateObject.getDay();            //gets the day of week 0-6
                    var requestDate;

                    //assigning day of week to each possible requested date string
                    if(date == "tomorrow") {
                        requestDate = (dayOfWeek + 1) % 7;
                    }
                    else if(date == "today") {
                        requestDate = dayOfWeek;
                    }
                    else if(date == "Sunday") {
                        requestDate = 0;
                    }
                    else if(date == "Monday") {
                        requestDate = 1;
                    }
                    else if(date == "Tuesday") {
                        requestDate = 2;
                    }
                    else if(date == "Wednesday") {
                        requestDate = 3;
                    }
                    else if(date == "Thursday") {
                        requestDate = 4;
                    }
                    else if(date == "Friday") {
                        requestDate = 5;
                    }
                    else if(date == "Saturday") {
                        requestDate = 6;
                    }

                    //calculating the date difference of the week 
                    var dateDiff;
                    if (requestDate != null) {
                        // Find the difference b/w days
                        dateDiff = requestDate - dayOfWeek;
                        if (dateDiff < 0)
                            dateDiff += 7;
                    } else
                        console.log("requestDate is null: line ~231")

                    //calculating the day that the user wants to schedule an activity
                    var newDate = dateDiff + todayDate;
                    
                    if (forecast.time.monthday == newDate)
                        hourlyForecast.push(forecast);  
                }

                callback(null, intent, timeOfDay, hourlyForecast);
            }); // finished fetching data
        },
        function(intent, timeOfDay, hourlyForecast, callback) {
            var sortedForecast = rankAndSortForecast(hourlyForecast, intent, timeOfDay);
            console.log(sortedForecast);
            callback(null, sortedForecast);
        },
        function(sortedForecast, callback) {
            sendTopResults(sortedForecast, res);
            callback(null, 'Success!');
        }
    ], function(err, result) {
        if (err)
            res.send(JSON.stringify(err));
        else
            console.log(result);
    });
}

// *********************************************** \\
// *** IBM WATSON NATURAL LANGUAGE CLASSIFIERS *** \\
// *********************************************** \\

function getActivityClassifier(text, callback) {
 
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
            // Return the intents 
            var intents = response.top_class.split(',');
            callback(null, intents);
        }
    });
    
}

function getTimeOfDayClassifier(text, intents, callback) {
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
            // Return the time of day
            callback(null, intents, timeOfDay);
        }
    });
}

function getTimeClassifier(text, intents, timeOfDay, callback) {
    
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
            // Return the date
            var date = response.top_class;
            callback(null, intents, timeOfDay, date);
        }
    });

}

// ************************************ \\
// **** WUNDERGROUND Data Fetching **** \\
// ************************************ \\

function generateWeatherRequestURL(latitude, longitude, date) {
    
   var weatherForecastURL = "http://api.wunderground.com/api/<APIKEY>/hourly10day/q/<LATITUDE>,<LONGITUDE>.json";
    
    weatherForecastURL = weatherForecastURL.replace(/<LATITUDE>/, String(latitude));
    weatherForecastURL = weatherForecastURL.replace(/<LONGITUDE>/, String(longitude));
    weatherForecastURL = weatherForecastURL.replace(/<APIKEY>/, WUNDERGROUND_APIKEY);

    console.log(weatherForecastURL);
    
    return weatherForecastURL;
}

// ***************************************** \\
// **** RANKING and FORECASTING METHODS **** \\
// ***************************************** \\

// Define function to validate forecasts
function validForecast(forecast) {
    // Assume forecast is valid 
    var returnValue = true;

    // If empty, not valid
    if (forecast.length == 0) {
       returnValue = false;
    // If time is -1, it is an error message, throw it
    } else if (forecast.time == -1) {
       throw new Error(forecast);
       returnValue = false;
    }
    return returnValue;
}

function rankAndSortForecast(hourlyForecast, intent, timeOfDay) {
    //SUMMER
    var sForecast = summerForecast(hourlyForecast, intent);
    if (!validForecast(sForecast)) {
       sForecast = hourlyForecast; // fill in with all original values
    }

    // WINTER
    var wsForecast = winterForecast(sForecast, intent);
    if (!validForecast(wsForecast)) {
       wsForecast = sForecast; // fill in with all previous values
    }

    // VISIBILITY
    var vwsForecast = visibilityForecast(wsForecast, intent);
    if (!validForecast(vwsForecast)) {
       vwsForecast = wsForecast; // fill in with all previous values
    }

    // TIME (Doesn''t need checking, always returns all elements)
    var tvwsForecast = timeRank(vwsForecast, timeOfDay);

    // Sort the forecasts with rankings and return
    return sortThis(tvwsForecast);
}

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


function computeVisibility(forecast) {
    var visibility1 = 0.45 * forecast.mslp - 447;
    var visibility2 = 1.13 * (forecast.temperature - forecast.dewpoint) - 1.15;
    
    return ((0.545 * visibility1) + (0.455 * visibility2));
}

function visibilityForecast(forecastsToUse, intent) {
    
        var BAD_VISIBILITY = "Bad visibility all day. Maybe choose another activity."
        var BAD_WIND = "High winds all day. Maybe choose another activity."
        var visibilityCheck = false;
        var windCheck = false;
        var acceptableForecast = [];
        
        if (includes(intent, 'visibility')) {
            // for sports that need good visibility
            for (var i = 0; i < forecastsToUse.length; i++) {
                // Check within acceptable time 
                if (forecastsToUse[i].time.hours > 7 && forecastsToUse[i].time.hours <= 22) {
                    // Compute visibility in miles
                    var visibility = computeVisibility(forecastsToUse[i]);
                    if (visibility > 1){
                        visibilityCheck = true;
                       //Checking for extreme winds
                        if (forecastsToUse[i].windSpeed < 10){
                            windCheck = true;
                            if (!includes(acceptableForecast, forecastsToUse[i]))
                                acceptableForecast.push(forecastsToUse[i]);
                        }   
                    }  
                }   
            }
            if (!visibilityCheck){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = BAD_VISIBILITY;
                result.push(pebbleResult)
                acceptableForecast = result;
            }
            else if (!windCheck){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = BAD_WIND;
                result.push(pebbleResult)
                acceptableForecast = result
            } else {
                acceptableForecast = visibilityRank(acceptableForecast);
            }
        }
        return acceptableForecast
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


function winterRank(acceptableForecast) {
    var IDEAL_TEMP = 28
    var MAX_TEMP_DIFFERENCE = 13
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - IDEAL_TEMP))/MAX_TEMP_DIFFERENCE
        var snowChangeWeight = 0.5 * (Math.abs(100-acceptableForecast[i].snow))/100;
        
        acceptableForecast[i]["winterRank"] = tempWeight + snowChangeWeight;
        
        if (acceptableForecast[i].winterRank > 1)
            console.log("Something is very wrong.");
    }
    return acceptableForecast;
}

function winterForecast(hourlyForecast, intent) {
        var NOSNOW = "Not Enough Snow"
        var BAD_TEMP = "Temperature is not optimal for this activity today."
        var snowCheck = false;
        var tempCheck = false;
        var acceptableForecast = []
        
        if (includes(intent, 'winter')){
            //consider temp, snow, snow probability, wind, windchill
            for (var i = 0; i < hourlyForecast.length; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 7 && hourlyForecast[i].time.hours <= 22) {
                    //Check for acceptable cold temperature
                    if (hourlyForecast[i].temperature < 40 && hourlyForecast[i].temperature > 20){
                        tempCheck = true;
                        //Check for snowfall in mm
                        // if (hourlyForecast[i].snow > 3) {
                            snowCheck = true;
                            // Check for wind chill
                            if (hourlyForecast[i].feelsLike < 40 && hourlyForecast[i].feelsLike > 15) {
                                acceptableForecast.push(hourlyForecast[i]);
                            }   
                        // }   
                    }   
                }  
            }

            if (!snowCheck){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = NOSNOW
                result.push(pebbleResult)
                acceptableForecast = result;
                
            } else if(!tempCheck){
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
        var PRECIPITATION = "There is a high chance of precipitation all day."
        var TEMP = "Extreme temperatures all day long. Exercise with caution."
        var precipitationCheck = false; 
        var extremeTempCheck = false;
        var acceptableForecast = []
        
        if (includes(intent, 'summer')) {
            
            for (var i = 0; i < hourlyForecast.length; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 3 && hourlyForecast[i].time.hours <= 23) {
                    // Check hours with no rain probablities
                    if (hourlyForecast[i].pop < 35) {
                        precipitationCheck = true;
                        // Check temperature min and max
                        if (hourlyForecast[i].temperature > 15 && hourlyForecast[i].temperature < 30) {
                            extremeTempCheck = true;
                            acceptableForecast.push(hourlyForecast[i])
                        }
                    }
                }
            }
            
            if (!precipitationCheck){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = PRECIPITATION;
                result.push(pebbleResult)
                acceptableForecast = result;
            }
            else if (!extremeTempCheck){
                var result = []
                var pebbleResult = {}
                pebbleResult.time = -1
                pebbleResult.timeString = TEMP;
                result.push(pebbleResult)
                acceptableForecast = result;
            } else {
                acceptableForecast = summerRank(acceptableForecast);
            }
        }
        
    return acceptableForecast;
}

function summerRank(acceptableForecast) {
    var IDEAL_PRECIPITATION_PERC = 37
    var MAX_TEMP_DIFFERENCE = 25
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var rainWeight = 0.5 * (Math.abs(acceptableForecast[i].pop/ IDEAL_PRECIPITATION_PERC));
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - 65))/MAX_TEMP_DIFFERENCE;
        
        acceptableForecast[i].summerRank = tempWeight + rainWeight;
        
        if (acceptableForecast[i].summerRank > 1)
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
    fs.readFile('.credentials/clients.json', function(err, data) {
        if (err)
            console.log(err)
        else if (data != '')
            CLIENTS = JSON.parse(data);
    });
}

// Save client info to file store
function saveClients() {
    fs.writeFile('.credentials/clients.json', JSON.stringify(CLIENTS), function(err) {
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


