require 'sinatra'

get '/' do
  template("Now, here's a simple app! <a href='/login'>Login</a>")
end

get '/login' do
  template(<<-EOP
    Login below
    <form action="/do-login" method="post">
    Username
    <input type="text" name="username">
    Password
    <input type="password" name="password">
    <input type="submit">
    </form>
  EOP
  )
end

post '/do-login' do
  template("Got params #{params}")
end

def template(body)
  "<html><body>#{body}</html>"
end
