var fs = require('fs');
var path = require('path');
var util = require('util');

var express = require('express');
var ejs = require('ejs');
var compression = require('compression');
var bodyParser = require('body-parser');
var multer = require('multer');
var storage = multer.memoryStorage();
var upload = multer({ storage: storage });
var fetch = require('node-fetch');

var yaml = require('js-yaml');

var converter = require('swagger2openapi');
var validator = require('swagger2openapi/validate.js');
var s2oVersion = require('swagger2openapi/common.js').getVersion();

var status = {};
status.startTime = new Date();
status.conversions = 0;
status.validations = 0;
status.badges = 0;
status.targetVersion = converter.targetVersion;
status.s2oVersion = s2oVersion;
status.self = require('./package.json');

function getObj(body,payload){
	var obj = {};
	try {
		obj = JSON.parse(body);
	}
	catch(ex) {
		try {
			obj = yaml.safeLoad(body);
			payload.yaml = true;
		}
		catch(ex) {
			console.log(body);
		}
	}
	return obj;
}

function parseRequest(req){
	var payload = {
		yamlResponse: false
	};
	payload.prefix = '<html><body><pre>';
	payload.contentType = 'text/html';

	if (req.headers.accept.startsWith('application/json')) {
		payload.prefix = '';
		payload.contentType = 'application/json';
	}
	if (req.headers.accept.indexOf('yaml')>=0) {
		payload.prefix = '';
		payload.contentType = 'text/yaml';
		payload.yamlResponse = true;
	}

	return payload;
}

var app = express();

app.options('*',function(req,res,next){
	res.set('Access-Control-Allow-Origin',req.headers['origin']||'*');
	res.set('Access-Control-Allow-Methods','GET, POST, HEAD, OPTIONS');
	res.set('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||
		'Content-Type, Authorization, Content-Length, X-Requested-With');
	res.sendStatus(204);
});

app.use(compression());
app.use(bodyParser.urlencoded({ extended: false }));

app.set('view engine', 'html');
app.engine('html', ejs.renderFile);

app.get('/', function(req,res) { res.render(path.join(__dirname,'index.html'),status) });
app.get('*.html', function(req,res) { res.render(path.join(__dirname,req.path,status)) });
app.use("/examples/",  express.static(path.join(__dirname,'examples')));

app.get('/contract/:spec.json',function(req,res){
	res.set('Content-Type', 'application/json');
	res.set('Access-Control-Allow-Origin','*');
	fs.readFile(path.join(__dirname,'contract',req.params.spec+'.json'),'utf8',function(err,data){
		res.send(data);
	});
});

app.use("/",  express.static(__dirname));

app.get('/api/v1/status',function(req,res){
	res.set('Content-Type', 'application/json');
	res.set('Access-Control-Allow-Origin','*');
	res.send(JSON.stringify(status,null,2));
});

function validate(req, res, badge) {
	status.validations++;
	result = {};
	result.status = false;
	if (req.query.url) {
		fetch(req.query.url).then(function(res) {
 	 		return res.text();
		}).then(function(body) {
			var payload = parseRequest(req);
			var obj = getObj(body,payload);
			var options = {};
			try {
				result.status = validator.validateSync(obj,options);
			}
			catch(ex) {
				result.message = ex.message;
				result.context = options.context.pop();
			}
			if (badge) {
				status.badges++;
				if (result.status) {
					res.redirect('https://img.shields.io/badge/OpenAPI3-Valid-brightgreen.svg');
				}
				else {
					res.redirect('https://img.shields.io/badge/OpenAPI3-Invalid-red.svg');
				}
			}
			else {
				res.set('Content-Type', 'application/json');
				res.set('Access-Control-Allow-Origin','*');
	 			res.send(JSON.stringify(result,null,2));
			}
		});

	}
	else {
		result.message = 'You must provide a URL parameter';
		res.set('Content-Type', 'application/json');
		res.send(JSON.stringify(result,null,2));
	}
}

app.get('/api/v1/validate', function(req,res) {
	validate(req,res,false);
});
app.get('/api/v1/badge', function(req,res) {
	validate(req,res,true);
});

app.post('/api/v1/validate', upload.single('filename'), function(req,res){
	status.validations++;
	var result = {};
	result.status = false;
	var body = req.body.source||(req.file ? req.file.buffer.toString() : '');
	var payload = parseRequest(req);

	if (req.headers['content-type'].startsWith('application/x-www-form-urlencoded')) {
		result.warning = 'Your client sent the wrong Content-Type header. Try pasting your document';
	}
	var obj = getObj(body,payload);
	var options = {};
	try {
		result.status = validator.validateSync(obj,options);
	}
	catch(ex) {
		result.message = ex.message;
		result.context = options.context.pop();
	}
	res.set('Content-Type',payload.contentType);
	res.set('Access-Control-Allow-Origin','*');

	if (payload.yamlResponse === true) {
		res.send(payload.prefix+yaml.safeDump(result));
		return;
	}

	res.send(payload.prefix+JSON.stringify(result,null,2));
});

app.get('/api/v1/convert', function(req,res) {
	status.conversions++;
	result = {};
	result.status = false;
	res.set('Access-Control-Allow-Origin','*');
	if (req.query.url) {
		fetch(req.query.url).then(function(res) {
 	 		return res.text();
		}).then(function(body) {
			var payload = parseRequest(req);
			var obj = getObj(body,payload);
			var options = {};
			options.origin = req.query.url;
			options.patch = true;
			try {
				converter.convert(obj,options,function(err,options){
					result = options.openapi;
					if (req.query.validate) {
						status.validations++;
						try {
							result = {};
							result.status = validator.validateSync(options.openapi,options);
						}
						catch (ex) {
							result.status = false; // reset
							if (options.context) {
								result.context = options.context.pop();
							}
							result.message = ex.message;
						}
					}

					res.set('Content-Type',payload.contentType);
					if (payload.yamlResponse) {
						res.send(yaml.safeDump(result));
						return;
					}
					res.send(JSON.stringify(result,null,2));
				});
			}
			catch (ex) {
				result.message = ex.message;
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify(result,null,2));
			}
		});
	}
	else {
		result.message = 'You must provide a URL parameter';
		res.set('Content-Type', 'application/json');
		res.send(JSON.stringify(result,null,2));
	}
});

function finishConversion(res,result,payload){
	res.set('Access-Control-Allow-Origin','*');
	res.set('Content-Type',payload.contentType);
	if (payload.yamlResponse) {
		res.send(payload.prefix+yaml.safeDump(result));
		return;
	}
	res.send(payload.prefix+JSON.stringify(result,null,2));
}

app.post('/api/v1/convert', upload.single('filename'), function(req,res) {
	status.conversions++;
	var result = {};
	result.status = false;

	var body = (req.body ? req.body.source : '')||(req.file ? req.file.buffer.toString() : '');
	var validate = (req.body && req.body.validate); // on or undefined

	var payload = parseRequest(req);

	if (req.headers['content-type'].startsWith('application/x-www-form-urlencoded')) {
		result.warning = 'Your client sent the wrong Content-Type header. Try pasting your document';
	}
	var obj = getObj(body,payload);
	var options = {};
	options.patch = true;
	try {
		converter.convert(obj,options,function(err,options){
			if (err) {
				result.message = err.message||'no message';
			}
			else {
				result = options.openapi;
			}
			if (validate) {
				status.validations++;
				try {
					result = {};
					result.status = validator.validateSync(options.openapi,options);
				}
				catch (ex) {
					result.message = ex.message;
					if (options && options.context) {
						result.context = options.context.pop();
					}
				}
			}
			finishConversion(res,result,payload);

		});
	}
	catch(ex) {
		result.message = ex.message;
		finishConversion(res,result,payload);
	}
});

var myport = process.env.PORT || 3001;
if (process.argv.length>2) myport = process.argv[2];

var server = app.listen(myport, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Arapaho server listening at http://%s:%s', host, port);
});
