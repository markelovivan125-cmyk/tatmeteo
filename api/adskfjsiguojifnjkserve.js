  if (!isAuth) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }
