var path = require('path');

var express = require('express');
var ejs = require('ejs');
var compression = require('compression');
var bodyParser = require('body-parser');

var yaml = require('js-yaml');

var converter = require('swagger2openapi');
var validator = require('swagger2openapi/validate.js');

var status = {};
status.startTime = new Date();
status.conversions = 0;
status.validations = 0;
status.targetVersion = converter.targetVersion;

function getObj(body){
	var obj = {};
	try {
		obj = JSON.parse(body);
	}
	catch(ex) {
		try {
			obj = yaml.safeLoad(body);
		}
		catch(ex) {
			console.log(body);
		}
	}
	return obj;
}

var app = express();
app.use(compression());
app.use(bodyParser.urlencoded({ extended: false }));

app.set('view engine', 'html');
app.engine('html', ejs.renderFile);

app.get('/', function(req,res) { res.render(path.join(__dirname,'index.html'),status) });
app.get('*.html', function(req,res) { res.render(path.join(__dirname,req.path,status)) });
app.use("/",  express.static(__dirname));

app.get('/api/v1/status',function(req,res){
	res.send(JSON.stringify(status,null,2));
});
app.post('/api/v1/validate',function(req,res){
	status.validations++;
	var result = {};
	result.status = false;
	var body = req.body.source;
	var obj = getObj(body);
	try {
		result.status = validator.validate(obj,{});
	}
	catch(ex) {
		result.message = ex.message;
	}
	res.send(JSON.stringify(result,null,2));
});

app.post('/api/v1/convert',function(req,res){
	status.conversions++;
	var result = {};
	result.status = false;
	var body = req.body.source;
	var obj = getObj(body);
	try {
		result = converter.convert(obj,{});
	}
	catch(ex) {
		result.message = ex.message;
	}
	res.send(JSON.stringify(result,null,2));
});

var myport = process.env.PORT || 3000;
if (process.argv.length>2) myport = process.argv[2];

var server = app.listen(myport, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Arapaho server listening at http://%s:%s', host, port);
});
