import express from 'express'
import healthRouter from './routes/health.js'
import usersRouter from './routes/users.js'

const app = express()
app.use(express.json())

app.use('/health', healthRouter)
app.use('/users', usersRouter)

const PORT = process.env.PORT ?? 3000

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

export default app
