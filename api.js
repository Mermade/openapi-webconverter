const fs = require('fs');
const path = require('path');
const util = require('util');
const url = require('url');

const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const fetch = require('node-fetch');

const yaml = require('js-yaml');

const converter = require('swagger2openapi');
const validator = require('oas-validator');
const s2oVersion = require('swagger2openapi/package.json').version;
const recurse = require('reftools/lib/recurse.js').recurse;

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

    if (req.headers.accept) {
        if (req.headers.accept.startsWith('application/json')) {
            payload.prefix = '';
            payload.contentType = 'application/json';
        }
        if (req.headers.accept.indexOf('yaml')>=0) {
            payload.prefix = '';
            payload.contentType = 'application/x-yaml';
            payload.yamlResponse = true;
        }
    }

    return payload;
}

function sanitise(obj) {
    let result = Object.assign({},obj);
    recurse(result,{},function(o,key,state){
        if (typeof o[key] === 'function') {
            delete o[key];
        }
    });
    return result;
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

app.get('/api', function(req,res) {
    fs.readFile(path.join(__dirname,'index.html'),'utf8',function(err,data){
        res.send(data);
    });
});

app.get('/api/v1/status',function(req,res){
    let payload = parseRequest(req);
    sendObj(res,payload,status);
});

function superfetch(u) {
    let up = url.parse(u);
    if (up.protocol) return fetch(u);
    let data = '{"openapi": "404"}';
    try {
        data = fs.readFileSync(path.join(__dirname,u),'utf8');
    }
    catch (ex) {
        console.warn(ex.message);
    }
    return Promise.resolve({text:function(){return data}});
}

function validate(req, res, badge) {
    status.validations++;
    result = {};
    result.status = false;
    var payload = parseRequest(req);
    if (req.query.url) {
        superfetch(req.query.url).then(function(res) {
              return res.text();
        }).then(function(body) {
            var obj = getObj(body,payload);
            var options = { source: req.query.url, resolve:true };
            try {
                result.status = validator.validateSync(obj,options);
            }
            catch(ex) {
                result.message = ex.message||'No message';
                console.warn(ex);
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
        result.warning = `Your client sent the wrong Content-Type header (${req.headers['content-type']}). Try pasting your document`;
        payload.status = 400;
        if (!req.body.source && !req.file) payload.status = 200; // Dredd
    }
    var obj = getObj(body,payload);
    var options = { resolve:false };
    try {
        result.status = validator.validateSync(obj,options);
        if (result.status === true) payload.status = 200;
    }
    catch(ex) {
        result.message = ex.message;
        console.warn(ex);
        result.context = options.context.pop();
    }
    sendObj(res,payload,result);
});

app.get('/api/v1/convert', function(req,res) {
    status.conversions++;
    result = {};
    result.status = false;
    var payload = parseRequest(req);
    if (req.query.url) {
        superfetch(req.query.url).then(function(res) {
              return res.text();
        }).then(function(body) {
            var obj = getObj(body,payload);
            var globalOptions = options = {};
            options.origin = true;
            options.source = req.query.url;
            options.patch = true;
            options.resolve = true;
            try {
                converter.convert(obj,options,function(err,options){
                    if (err) {
                        result.error = err.message;
                        result.options = sanitise(globalOptions);
                    }
                    else result = options.openapi;
                    if (req.query.validate && options.openapi) {
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
                            console.warn(ex);
                        }
                    }

                    sendObj(res,payload,result);
                });
            }
            catch (ex) {
                result.message = ex.message;
                console.warn(ex);
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
        result.warning = `Your client sent the wrong Content-Type header (${req.headers['content-type']}). Try pasting your document`;
        payload.status = 400;
        if (!req.body.source && !req.file) payload.status = 200; // Dredd
    }
    var obj = getObj(body,payload);
    var options = {};
    options.patch = true;
    options.resolve = false;
    try {
        converter.convert(obj,options,function(err,options){
            if (err) {
                result.message = err.message||'no message';
                result.options = sanitise(result.options);
            }
            else {
                result = options.openapi;
                if (options.openapi && options.openapi.openapi && options.openapi.openapi.startsWith('3.')) payload.status = 200;
            }
            if (validate && !err) {
                status.validations++;
                try {
                    result = {};
                    result.status = validator.validateSync(options.openapi,options);
                    if (result.status === true) payload.status = 200;
                }
                catch (ex) {
                    result.message = ex.message;
                    console.warn(ex);
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
        console.warn(ex);
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

