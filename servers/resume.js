const mount = require('koa-mount')
const serve = require('koa-static')
const send = require('koa-send')
const Koa = require('koa')
const _ = require('lodash')
const fs = require('fs-extra')
const requestHistoryRepo = require('../persistence/client-requests')
const requestLogging = require('./utils/request-logger')

const port = 7776

runServer()

async function loadResumeDataFromFile() {
  const resumeJSON = await fs.readJson(__dirname + '/../resume/resume.json')
  const resume = {}
  resume.about = _.find(resumeJSON.sections, (section) => section.id == 'about')
  resume.education = _.find(
    resumeJSON.sections,
    (section) => section.id == 'education'
  )
  resume.experience = _.find(
    resumeJSON.sections,
    (section) => section.id == 'experience'
  )
  return resume
}

async function runServer() {
  console.log('Setting up AWS')
  await requestLogging.setupAWS()
  console.log('Retrieving resume data from file')
  let resume = await loadResumeDataFromFile()
  const app = new Koa()
  app.use(requestLogging.logRequest)
  app.use(serve('dist', {}))
  app.use(mount('/assets', serve('dist/assets')))

  app.use(async (ctx, next) => {
    try {
      await next()
      if (ctx.path == '/api/profile' && ctx.method == 'GET') {
        ctx.body = resume
      } else if (ctx.path == '/api/traffic/monthly' && ctx.method == 'GET') {
        ctx.body = await getMonthlyTraffic(ctx)
      } else if (ctx.path == '/api/traffic/daily' && ctx.method == 'GET') {
        ctx.body = await getDailyTraffic(ctx)
      } else if (ctx.path == '/api/health' && ctx.method == 'GET') {
        ctx.body = {
          healthy: true
        }
      } else if (ctx.path.startsWith('/api/')) {
        ctx.status = 404
        ctx.body = { code: 404, message: 'Nada' }
      } else {
        //console.log(`Serving resume app`)
        await send(ctx, './dist/index.html')
      }
    } catch (err) {
      console.error(err)
      ctx.status = 500
      ctx.body = `500: ${err.toString()}`
    }
  })

  app.listen(port, () => console.log(`Serving on port ${port}`))
}

async function getMonthlyTraffic(ctx) {
  const now = new Date()
  const year = parseInt(ctx.request.query['year'] || now.getUTCFullYear())
  const month = parseInt(ctx.request.query['month'] || now.getUTCMonth() + 1)
  const urlFilter = ctx.request.query['url']
  const urlQuery = urlFilter ? `&url=${encodeURIComponent(urlFilter)}` : ''

  if (year < 1000 || year > 5000) throw new Error('Invalid year')

  if (month < 1 || month > 12) throw new Error('Invalid month')

  const days = _.range(1, 32)
  const fetchAllDaysOfMonth = days.map((day) => {
    return requestHistoryRepo
      .getAllEntriesForDay(year, month, day)
      .then(function (queryResult) {
        const filteredRequests = queryResult.Items.filter(
          (i) => !urlFilter || i.requestUrl == urlFilter
        )
        return {
          day,
          requests: filteredRequests,
          total: filteredRequests.length || 0
        }
      })
  })
  const allDays = await Promise.all(fetchAllDaysOfMonth)
  const allDaysTotals = allDays.map((dayEntries) => ({
    day: dayEntries.day,
    total: dayEntries.total,
    href: `${ctx.origin}/api/traffic/daily?year=${year}&month=${month}&day=${dayEntries.day}${urlQuery}`
  }))

  const urls = _.uniq(
    allDays.reduce((acc, dayEntries) => {
      return acc.concat(dayEntries.requests.map((e) => e.requestUrl))
    }, [])
  )

  const nextMonth = month == 12 ? 1 : month + 1
  const nextYear = nextMonth > 1 ? year : year + 1
  const previousMonth = month == 1 ? 12 : month - 1
  const previousYear = previousMonth < 12 ? year : year - 1

  return {
    self: {
      href: `${ctx.origin}${ctx.path}?year=${year}&month=${month}${urlQuery}`
    },
    next: {
      href: `${ctx.origin}${ctx.path}?year=${nextYear}&month=${nextMonth}${urlQuery}`
    },
    previous: {
      href: `${ctx.origin}${ctx.path}?year=${previousYear}&month=${previousMonth}${urlQuery}`
    },
    year: year,
    month: month,
    total: allDaysTotals.reduce((acc, dailyTotal) => {
      return acc + dailyTotal.total
    }, 0),
    dailyTotals: allDaysTotals.filter((dailyTotal) => dailyTotal.total > 0),
    urls: urls.map((url) => ({
      value: url,
      href: `${ctx.origin}${
        ctx.path
      }?year=${year}&month=${month}&url=${encodeURIComponent(url)}`
    }))
  }
}

async function getDailyTraffic(ctx) {
  const now = new Date()
  const year = parseInt(ctx.request.query['year'] || now.getUTCFullYear())
  const month = parseInt(ctx.request.query['month'] || now.getUTCMonth() + 1)
  const day = parseInt(ctx.request.query['day'] || now.getUTCDate())
  const urlFilter = ctx.request.query['url']

  if (year < 1000 || year > 5000) throw new Error('Invalid year')

  if (month < 1 || month > 12) throw new Error('Invalid month')

  if (day < 1 || day > 31) throw new Error('Invalid day')

  const hits = await requestHistoryRepo.getAllEntriesForDay(year, month, day)

  const filteredRequests = hits.Items.filter(
    (i) => !urlFilter || i.requestUrl == urlFilter
  ).map((request) => ({
    ...request,
    href: `${ctx.origin}${
      ctx.path
    }?year=${year}&month=${month}&day=${day}&url=${encodeURIComponent(
      request.requestUrl
    )}`
  }))
  return {
    year,
    month,
    day,
    requests: filteredRequests,
    total: filteredRequests.length || 0
  }
}
