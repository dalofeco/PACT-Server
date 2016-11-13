// AccuWeather API Key
var APIKEY =  "PSUHackathon112016";

/* IMPORTS */
var express = require('express');
var fs = require('fs');
var includes = require('array-includes');
var app = express();
var bodyParser = require("body-parser");
var Client = require("node-rest-client").Client;
var client = new Client();

/* Serving static files in express */
app.use('/css', express.static('css'));

app.use(bodyParser.urlencoded({
    extended: false,
}));

app.use(bodyParser.json());

app.get('/activity', function(req, res) {
    var intent = [];
    intent.push(req.query.intent);
    var latitude = req.query.latitude;
    var longitude = req.query.longitude;
    getLocationKey(latitude, longitude, intent);
});

// Function that gets location key for long, lat pair and calls getWeatherInfo with key
function getLocationKey(latitude, longitude, intent) {
    
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
        getWeatherInfo(locationKey, intent);
    });
}

function getWeatherInfo(locationKey, intent) {
    var weatherForecastURL = "http://apidev.accuweather.com/forecasts/v1/hourly/24hour/<LATLONG>.json?apikey=<APIKEY>&details=true&metric=false";
    
    weatherForecastURL = weatherForecastURL.replace(/<LATLONG>/, String(locationKey));
    weatherForecastURL = weatherForecastURL.replace(/<APIKEY>/, APIKEY);

    client.get(weatherForecastURL, function(data, response) {
        
        // static variable holding number of hours searched
        var NUM_HOURS = 24
        var hourlyForecast = [];
        
        for (var i = 0; i < NUM_HOURS; i++) {
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
            
            // Add to hourlyforecast array
            hourlyForecast.push(forecast);
        }
        if (includes(intent, 'summer')) {
            // 
            var acceptableForecast = []
            for (var i = 0; i < NUM_HOURS; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 3 && hourlyForecast[i].time.hours <= 23) {
                    // Check hours with no rain probablities
                    if (hourlyForecast[i].probablities.rain < 37) {
                        // Check temperature min and max
                        if (hourlyForecast[i].temperature > 40 && hourlyForecast[i].temperature < 90) {
                            acceptableForecast.push(hourlyForecast[i])
                        }
                    }
                }
            }
            
           var rankedForecasts = summerRank(acceptableForecast);
           for (var i = 0; i < rankedForecasts.length; i++)
                console.log(rankedForecasts[i]);
                console.log('\n');
        }
        if (includes(intent, 'winter')){
            //consider temp, snow, snow probability, wind, windchill
            var acceptableForecast = []
            for (var i = 0; i < NUM_HOURS; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 7 && hourlyForecast[i].time.hours <= 22) {
                    //Check for acceptable cold temperature
                    if (hourlyForecast[i].temperature < 40 && hourlyForecast[i].temperature > 20){
                        //Check for snowfall in inches
                        if (hourlyForecast[i].onGround.snow > 3){
                            //Check for wind chill
                            if (hourlyForecast[i].realFeel < 40 && hourlyForecast[i].realFeel > 15) {
                                acceptableForecast.push(hourlyForecast[i]);
                            }   
                        }   
                    }   
                }  
                
            } // End FOR loop
            //Then rank, based on snow chances, temperature, realfeel 
            var rankedForecasts = winterRank(acceptableForecast);
            console.log(rankedForecasts);
        }

        if (includes(intent, 'visibility')){
            //for sports that need good visibility
            var acceptableForecast = []
            for (var i = 0; i < NUM_HOURS; i++) {
                // Check within acceptable time 
                if (hourlyForecast[i].time.hours > 7 && hourlyForecast[i].time.hours <= 22) {
                    //Checking for visibility
                    if (hourlyForecast[i].seenVisibility < 1){
                       //Checking for extreme winds
                        if (hourlyForecast[i].windSpeed < 10){
                            acceptableForecast.push(hourlyForecast[i]);
                        }   
                    }  
                }   
            }
             var rankedForecasts = visibilityRank(acceptableForecast);
             console.log(rankedForecasts);
            
        }   
    });
}
    
function winterRank(acceptableForecast) {
    var IDEAL_TEMP = 28
    var MAX_TEMP_DIFFERENCE = 13
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - IDEAL_TEMP))/MAX_TEMP_DIFFERENCE
        var snowChangeWeight = 0.5 * (Math.abs(100-acceptableForecast[i].probablities.snow))/100;
        
        acceptableForecast[i].rank = tempWeight + snowChangeWeight;
        
        if (acceptableForecast[i].rank > 1)
            console.log("Something is very wrong.");
    }
    
    acceptableForecast.sort(function(a,b) {
        return b.rank - a.rank;
    });
    
    return acceptableForecast;
}

function summerRank(acceptableForecast) {
    var IDEAL_RAIN_PERC = 37
    var MAX_TEMP_DIFFERENCE = 25
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var rainWeight = 0.5 * (Math.abs(acceptableForecast[i].probablities.rain/ IDEAL_RAIN_PERC));
        var tempWeight = 0.5 * (Math.abs(acceptableForecast[i].temperature - 65))/MAX_TEMP_DIFFERENCE;
        
        acceptableForecast[i].rank = tempWeight + rainWeight;
        
        if (acceptableForecast[i].rank > 1)
            console.log("Something is very wrong.");
    }
    
    acceptableForecast.sort(function(a,b) {
        return b.rank - a.rank;
    });
    
    return acceptableForecast;
}

function visibilityRank(acceptableForecast) {
    var VISIBILITY_MILES = 1
    var WIND_SPEED = 10
    
    // Calculate the weights utilized for the sort algorithm
    for (var i = 0; i < acceptableForecast.length; i++) {
        var visWeight = 0.5 * (Math.abs(acceptableForecast[i].seenVisibility/ VISIBILITY_MILES));
        var windWeight = 0.5 * (Math.abs(acceptableForecast[i].windSpeed))/WIND_SPEED;
        
        acceptableForecast[i].rank = visWeight + windWeight;
        
        if (acceptableForecast[i].rank > 1)
            console.log("Something is very wrong.");
    }
    
    acceptableForecast.sort(function(a,b) {
        return b.rank - a.rank;
    });
    
    return acceptableForecast;
}

/* Listens on the Server Port */
var server = app.listen(process.env.PORT || '8080', '0.0.0.0', function() {
    if(process.env.PORT){
        console.log("https://slide-master-abdallahozaifa.c9users.io/");
    }else{
        console.log('App listening at http://%s:%s', server.address().address, server.address().port);
    }
});
// [END app]