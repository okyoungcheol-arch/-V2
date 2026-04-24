import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.43', '192.168.0.7', '192.168.0.40'],
  async redirects() {
    return [
      // /admin/* → /* (구 경로 일괄 리다이렉트)
      { source: '/admin/dashboard',    destination: '/dashboard',    permanent: true },
      { source: '/admin/dispatches',   destination: '/dispatches',   permanent: true },
      { source: '/admin/routes',       destination: '/routes',       permanent: true },
      { source: '/admin/installments', destination: '/installments', permanent: true },
      { source: '/admin/operations',   destination: '/operations',   permanent: true },
      { source: '/admin/bank',         destination: '/bank',         permanent: true },
      { source: '/admin/ledger',       destination: '/ledger',       permanent: true },
      { source: '/admin/vehicles',     destination: '/vehicles',     permanent: true },
      { source: '/admin/employees',    destination: '/employees',    permanent: true },
      { source: '/admin/clients',      destination: '/clients',      permanent: true },
      // /driver/* → /* (구 경로 일괄 리다이렉트)
      { source: '/driver/schedule',    destination: '/schedule',     permanent: true },
      { source: '/driver/earnings',    destination: '/earnings',     permanent: true },
    ]
  },
}

export default nextConfig
