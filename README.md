# Online Swagger 2.0 to OpenAPI 3.0.x converter

[Convert](https://openapi-converter.herokuapp.com) Swagger 2.0 definitions or [validate](https://openapi-converter.herokuapp.com) OpenAPI 3.0.x definitions

Conversions and validations are performed by [swagger2openapi](https://github.com/mermade/swagger2openapi)

You may also use the [API](http://petstore.swagger.io/?url=https://openapi-converter.herokuapp.com/contract/swagger.json) to convert Swagger 2.0 definitions or validate a 3.0.x definition
<p>
<ul>
   <li><i>POST</i> <b>/api/v1/convert</b> - with a source or filename parameter, optionally with validate=on</li>
   <li><i>POST</i> <b>/api/v1/validate</b> - with a source or filename parameter</li>
   <li><i>GET</i> <a href="https://openapi-converter.herokuapp.com/api/v1/status">/api/v1/status</a></li>
   <li><i>GET</i> <b>/api/v1/convert?url=...</b> optionally with a <b>validate</b> parameter</li>
   <li><i>GET</i> <b>/api/v1/validate?url=...</b></li>
   <li><i>GET</i> <b>/api/v1/badge?url=...</b> returns a redirect to an SVG badge</li>
</ul>

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
