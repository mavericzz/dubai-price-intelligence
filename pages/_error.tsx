import type { NextPage } from 'next';

const ErrorPage: NextPage<{ statusCode?: number }> = ({ statusCode }) => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>{statusCode || 'Error'}</h1>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        {statusCode === 404 ? 'Page not found' : 'An error occurred'}
      </p>
    </div>
  );
};

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
