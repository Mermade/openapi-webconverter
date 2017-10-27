var path = require('path');

var express = require('express');
var ejs = require('ejs');

var api = require('./api.js').api;
var app = api.app;
var status = api.status;

// nice stack traces
process.on('unhandledRejection', r => console.log(r));

app.set('view engine', 'html');
app.engine('html', ejs.renderFile);

app.get('/', function(req,res) { res.render(path.join(__dirname,'index.html'),status) });
app.get('*.html', function(req,res) { res.render(path.join(__dirname,req.path,status)) });
app.use("/examples/",  express.static(path.join(__dirname,'examples')));

app.use("/",  express.static(__dirname));

var myport = process.env.PORT || 3001;
if (process.argv.length>2) myport = process.argv[2];

var server = app.listen(myport, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Arapaho server listening at http://%s:%s', host, port);
});
