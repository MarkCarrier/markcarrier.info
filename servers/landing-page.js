const mount = require('koa-mount')
const serve = require('koa-static')
const send = require('koa-send')
const Koa = require('koa')
const _ = require('lodash')

module.exports =  async function startLandingPageServer(port) {
    return new Promise(function(resolve, reject) {
        try {
            let app = new Koa()
            app.use(require('./utils/request-logger'))
            app.use(mount('/assets', serve('dist/assets')))
            app.use(async (ctx, next) => {
                if(ctx.path == "/api/health" && ctx.method == "GET") {
                    ctx.body = {
                        healthy: true
                    }
                } else {
                    //console.log(`Serving landing page`)
                    await send(ctx, "./dist/assets/home.html")
                }
            })
            app.listen(port, resolve)
        } catch(err) {
            console.error(err)
            reject(err)
        }
    })
}