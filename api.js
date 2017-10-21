var fs = require('fs');
var path = require('path');
var util = require('util');

var express = require('express');
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
            obj = yaml.safeLoad(body,{json:true});
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
        payload.contentType = 'application/x-yaml';
        payload.yamlResponse = true;
    }

    return payload;
}

function sendObj(res,payload,obj) {
    if (!payload.prefix) payload.prefix = '';
    if (payload.status) res.status(payload.status);
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type', payload.contentType);
    if (!payload.yamlResponse && payload.contentType.startsWith('application/json')) {
        res.send(new Buffer.from(payload.prefix+JSON.stringify(obj,null,2)));
    }
    else {
        res.send(new Buffer(payload.prefix+yaml.safeDump(obj)));
    }
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

app.get('/contract/:spec.json',function(req,res){
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin','*');
    fs.readFile(path.join(__dirname,'contract',req.params.spec+'.json'),'utf8',function(err,data){
        res.send(data);
    });
});

app.get('/contract/:spec.yaml',function(req,res){
    res.set('Content-Type', 'application/x-yaml');
    res.set('Access-Control-Allow-Origin','*');
    fs.readFile(path.join(__dirname,'contract',req.params.spec+'.json'),'utf8',function(err,data){
        res.send(yaml.safeDump(yaml.safeLoad(data,{json:true})));
    });
});

app.get('/api/v1/status',function(req,res){
    let payload = parseRequest(req);
    sendObj(res,payload,status);
});

function validate(req, res, badge) {
    status.validations++;
    result = {};
    result.status = false;
    var payload = parseRequest(req);
    if (req.query.url) {
        fetch(req.query.url).then(function(res) {
              return res.text();
        }).then(function(body) {
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
                sendObj(res,payload,result);
            }
        });

    }
    else {
        result.message = 'You must provide a URL parameter';
        sendObj(res,payload,result);
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
        payload.status = 400;
        if (!req.body.source && !req.file) payload.status = 200; // Dredd
    }
    var obj = getObj(body,payload);
    var options = {};
    try {
        result.status = validator.validateSync(obj,options);
        if (result.status === true) payload.status = 200;
    }
    catch(ex) {
        result.message = ex.message;
        result.context = options.context.pop();
    }
    sendObj(res,payload,result);
});

app.get('/api/v1/convert', function(req,res) {
    status.conversions++;
    result = {};
    result.status = false;
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
                    if (err) {
                        result.error = err;
                        result.options = options;
                    }
                    else result = options.openapi;
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

                    sendObj(res,payload,result);
                });
            }
            catch (ex) {
                result.message = ex.message;
                sendObj(res,payload,result);
            }
        });
    }
    else {
        result.message = 'You must provide a URL parameter';
        sendObj(res,payload,result);
    }
});

function finishConversion(res,result,payload){
    sendObj(res,payload,result);
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
        payload.status = 400;
        if (!req.body.source && !req.file) payload.status = 200; // Dredd
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
                if (options.openapi && options.openapi.openapi && options.openapi.openapi.startsWith('3.')) payload.status = 200;
            }
            if (validate) {
                status.validations++;
                try {
                    result = {};
                    result.status = validator.validateSync(options.openapi,options);
                    if (result.status === true) payload.status = 200;
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

module.exports = {
    api : {
        app : app,
        upload, upload,
        status: status
    }
};

