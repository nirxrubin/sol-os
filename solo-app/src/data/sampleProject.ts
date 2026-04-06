import type { Project, AnalysisStep } from './types';

export const analysisSteps: AnalysisStep[] = [
  {
    id: 'step-1',
    label: 'Parsing project structure',
    description: 'Unpacking files and cataloging project assets',
    status: 'complete',
    details: [
      '52 HTML/CSS/JS files detected',
      '28 image assets found',
      '10 page templates identified',
      '3 font families included',
    ],
  },
  {
    id: 'step-2',
    label: 'Detecting pages and routes',
    description: 'Analyzing DOM structure and identifying page routes',
    status: 'complete',
    details: [
      'Home: 8 sections detected',
      'About: 5 sections detected',
      'Services: 4 sections detected',
      'Portfolio: 3 sections detected',
      'Blog: 3 sections detected',
      'Blog Post: 4 sections detected',
      'Team: 3 sections detected',
      'Contact: 3 sections detected',
      'Careers: 4 sections detected',
      'FAQ: 3 sections detected',
    ],
  },
  {
    id: 'step-3',
    label: 'Analyzing content entities',
    description: 'Identifying repeated structures and content collections',
    status: 'complete',
    details: [
      '9 content collections identified',
      '6 testimonials extracted',
      '4 blog posts extracted',
      '4 services extracted',
      '4 portfolio projects extracted',
      '8 FAQ entries extracted',
    ],
  },
  {
    id: 'step-4',
    label: 'Scanning frontend architecture',
    description: 'Detecting frameworks, components, and build configuration',
    status: 'complete',
    details: [
      'React 18 with TypeScript detected',
      'Vite build tool identified',
      'Tailwind CSS v4 in use',
      '14 reusable components found',
    ],
  },
  {
    id: 'step-5',
    label: 'Evaluating security posture',
    description: 'Checking SSL, headers, and dependency vulnerabilities',
    status: 'complete',
    details: [
      'No SSL certificate detected',
      'Missing security headers (HSTS, CSP)',
      '0 critical dependency vulnerabilities',
      'HTTPS redirect not configured',
    ],
  },
  {
    id: 'step-6',
    label: 'Auditing media assets',
    description: 'Analyzing images, SVGs, and other media for optimization',
    status: 'complete',
    details: [
      '14 images analyzed',
      '4 SVGs detected',
      '2 images need optimization',
      'Total media size: 4.8 MB',
    ],
  },
  {
    id: 'step-7',
    label: 'Checking analytics setup',
    description: 'Scanning for analytics scripts and tracking configuration',
    status: 'complete',
    details: [
      'No analytics provider detected',
      'No conversion tracking found',
      'No event listeners for user actions',
    ],
  },
  {
    id: 'step-8',
    label: 'Reviewing SEO readiness',
    description: 'Auditing meta tags, sitemaps, and structured data',
    status: 'complete',
    details: [
      '4 pages missing meta descriptions',
      'No sitemap.xml found',
      'Open Graph tags incomplete on 7 pages',
      'No JSON-LD structured data',
    ],
  },
  {
    id: 'step-9',
    label: 'Mapping backend requirements',
    description: 'Identifying database, API, and server-side needs',
    status: 'complete',
    details: [
      'Contact form requires backend handler',
      'Blog content needs CMS integration',
      'No database currently connected',
    ],
  },
  {
    id: 'step-10',
    label: 'Preparing hosting analysis',
    description: 'Evaluating deployment options and infrastructure needs',
    status: 'complete',
    details: [
      'Static site compatible with edge hosting',
      'No server-side rendering detected',
      'CDN recommended for global performance',
    ],
  },
  {
    id: 'step-11',
    label: 'Generating launch canvas',
    description: 'Building your personalized tech stack and launch checklist',
    status: 'complete',
    details: [
      '11 tech sectors configured',
      '33 provider options available',
      '42 launch tasks generated',
      'Readiness score: 34%',
    ],
  },
  {
    id: 'step-12',
    label: 'Understanding your business context',
    description: 'AI is reading your content to understand what you do and who you serve',
    status: 'complete',
    details: [
      'Business type identified',
      'Target audience mapped',
      'Launch gaps detected',
      'Recommendations generated',
    ],
  },
];

export const sampleProject: Project = {
  name: 'Meridian Studio',
  url: 'https://meridianstudio.design',
  readinessScore: 34,

  // ── Pages ──────────────────────────────────────────────────────────────────
  pages: [
    {
      id: 'page-home',
      name: 'Home',
      path: '/',
      seoStatus: 'partial',
      sections: [
        {
          id: 'sec-home-header', type: 'header', name: 'Navigation Header',
          bindings: [
            { fieldId: 'cb-h1', contentTypeId: 'ct-site', fieldName: 'logo' },
            { fieldId: 'cb-h2', contentTypeId: 'ct-site', fieldName: 'navCta' },
          ],
        },
        {
          id: 'sec-home-hero', type: 'hero', name: 'Hero Section',
          bindings: [
            { fieldId: 'cb-hero1', contentTypeId: 'ct-site', fieldName: 'heroHeadline' },
            { fieldId: 'cb-hero2', contentTypeId: 'ct-site', fieldName: 'heroSubheadline' },
            { fieldId: 'cb-hero3', contentTypeId: 'ct-site', fieldName: 'heroImage' },
          ],
        },
        {
          id: 'sec-home-logos', type: 'logos', name: 'Client Logos',
          bindings: [
            { fieldId: 'cb-logos1', contentTypeId: 'ct-logos', fieldName: 'heading' },
          ],
        },
        {
          id: 'sec-home-features', type: 'features', name: 'Services Overview',
          bindings: [
            { fieldId: 'cb-feat1', contentTypeId: 'ct-services', fieldName: 'heading' },
          ],
        },
        {
          id: 'sec-home-stats', type: 'stats', name: 'Stats Bar',
          bindings: [
            { fieldId: 'cb-stats1', contentTypeId: 'ct-site', fieldName: 'statsClients' },
            { fieldId: 'cb-stats2', contentTypeId: 'ct-site', fieldName: 'statsProjects' },
            { fieldId: 'cb-stats3', contentTypeId: 'ct-site', fieldName: 'statsYears' },
          ],
        },
        {
          id: 'sec-home-testimonials', type: 'testimonials', name: 'Client Testimonials',
          bindings: [
            { fieldId: 'cb-test1', contentTypeId: 'ct-testimonials', fieldName: 'heading' },
          ],
        },
        {
          id: 'sec-home-cta', type: 'cta', name: 'Bottom CTA',
          bindings: [
            { fieldId: 'cb-cta1', contentTypeId: 'ct-site', fieldName: 'ctaHeadline' },
            { fieldId: 'cb-cta2', contentTypeId: 'ct-site', fieldName: 'ctaButton' },
          ],
        },
        {
          id: 'sec-home-footer', type: 'footer', name: 'Footer',
          bindings: [
            { fieldId: 'cb-foot1', contentTypeId: 'ct-site', fieldName: 'footerLogo' },
            { fieldId: 'cb-foot2', contentTypeId: 'ct-site', fieldName: 'copyright' },
          ],
        },
      ],
    },
    {
      id: 'page-about',
      name: 'About',
      path: '/about',
      seoStatus: 'partial',
      sections: [
        { id: 'sec-about-header', type: 'header', name: 'Navigation Header', bindings: [] },
        {
          id: 'sec-about-hero', type: 'hero', name: 'About Hero',
          bindings: [
            { fieldId: 'cb-ab1', contentTypeId: 'ct-site', fieldName: 'aboutHeadline' },
            { fieldId: 'cb-ab2', contentTypeId: 'ct-site', fieldName: 'aboutBody' },
          ],
        },
        {
          id: 'sec-about-stats', type: 'stats', name: 'Company Stats',
          bindings: [
            { fieldId: 'cb-abst1', contentTypeId: 'ct-site', fieldName: 'employees' },
            { fieldId: 'cb-abst2', contentTypeId: 'ct-site', fieldName: 'countries' },
          ],
        },
        {
          id: 'sec-about-cta', type: 'cta', name: 'Work With Us CTA',
          bindings: [
            { fieldId: 'cb-abcta1', contentTypeId: 'ct-site', fieldName: 'aboutCtaHeadline' },
          ],
        },
        { id: 'sec-about-footer', type: 'footer', name: 'Footer', bindings: [] },
      ],
    },
    {
      id: 'page-blog',
      name: 'Blog',
      path: '/blog',
      seoStatus: 'missing',
      sections: [
        { id: 'sec-blog-header', type: 'header', name: 'Navigation Header', bindings: [] },
        {
          id: 'sec-blog-list', type: 'generic', name: 'Blog Post Grid',
          bindings: [
            { fieldId: 'cb-bl1', contentTypeId: 'ct-blog', fieldName: 'heading' },
            { fieldId: 'cb-bl2', contentTypeId: 'ct-blog', fieldName: 'items' },
          ],
        },
        { id: 'sec-blog-footer', type: 'footer', name: 'Footer', bindings: [] },
      ],
    },
    {
      id: 'page-blog-post',
      name: 'Blog Post',
      path: '/blog/:slug',
      seoStatus: 'missing',
      sections: [
        { id: 'sec-blogpost-header', type: 'header', name: 'Navigation Header', bindings: [] },
        {
          id: 'sec-blogpost-content', type: 'generic', name: 'Article Content',
          bindings: [
            { fieldId: 'cb-bp1', contentTypeId: 'ct-blog', fieldName: 'title' },
            { fieldId: 'cb-bp2', contentTypeId: 'ct-blog', fieldName: 'body' },
            { fieldId: 'cb-bp3', contentTypeId: 'ct-blog', fieldName: 'author' },
            { fieldId: 'cb-bp4', contentTypeId: 'ct-blog', fieldName: 'date' },
          ],
        },
        {
          id: 'sec-blogpost-related', type: 'generic', name: 'Related Posts',
          bindings: [
            { fieldId: 'cb-bp5', contentTypeId: 'ct-blog', fieldName: 'relatedPosts' },
          ],
        },
        { id: 'sec-blogpost-footer', type: 'footer', name: 'Footer', bindings: [] },
      ],
    },
    {
      id: 'page-team',
      name: 'Team',
      path: '/team',
      seoStatus: 'partial',
      sections: [
        { id: 'sec-team-header', type: 'header', name: 'Navigation Header', bindings: [] },
        {
          id: 'sec-team-hero', type: 'hero', name: 'Team Hero',
          bindings: [
            { fieldId: 'cb-tm1', contentTypeId: 'ct-site', fieldName: 'teamHeadline' },
          ],
        },
        {
          id: 'sec-team-grid', type: 'generic', name: 'Team Grid',
          bindings: [
            { fieldId: 'cb-tm2', contentTypeId: 'ct-team', fieldName: 'members' },
          ],
        },
        { id: 'sec-team-footer', type: 'footer', name: 'Footer', bindings: [] },
      ],
    },
    {
      id: 'page-contact',
      name: 'Contact',
      path: '/contact',
      seoStatus: 'complete',
      sections: [
        { id: 'sec-contact-header', type: 'header', name: 'Navigation Header', bindings: [] },
        {
          id: 'sec-contact-form', type: 'generic', name: 'Contact Form',
          bindings: [
            { fieldId: 'cb-ct1', contentTypeId: 'ct-site', fieldName: 'contactHeadline' },
            { fieldId: 'cb-ct2', contentTypeId: 'ct-site', fieldName: 'contactEmail' },
          ],
        },
        { id: 'sec-contact-footer', type: 'footer', name: 'Footer', bindings: [] },
      ],
    },
  ],

  // ── Content Types ──────────────────────────────────────────────────────────
  contentTypes: [
    {
      id: 'ct-testimonials',
      name: 'Testimonials',
      linkedPages: ['page-home'],
      fields: [
        { id: 'f-test-name', name: 'Name', type: 'text', required: true },
        { id: 'f-test-role', name: 'Role', type: 'text', required: true },
        { id: 'f-test-company', name: 'Company', type: 'text', required: true },
        { id: 'f-test-quote', name: 'Quote', type: 'richtext', required: true },
        { id: 'f-test-avatar', name: 'Avatar', type: 'image', required: false },
        { id: 'f-test-rating', name: 'Rating', type: 'number', required: false },
      ],
      items: [
        {
          id: 'ti-1', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-20T10:00:00Z',
          data: { name: 'Sarah Chen', role: 'VP of Engineering', company: 'Lattice', quote: 'Meridian Studio cut our release cycle from two weeks to two days. The automation alone saved us 30 hours per sprint.', avatar: '/images/avatar-sarah.jpg', rating: 5 },
        },
        {
          id: 'ti-2', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-19T10:00:00Z',
          data: { name: 'Marcus Johnson', role: 'CTO', company: 'Ramp', quote: 'We evaluated six agencies before choosing Meridian. Nothing else came close in terms of design quality and developer experience.', avatar: '/images/avatar-marcus.jpg', rating: 5 },
        },
        {
          id: 'ti-3', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-18T10:00:00Z',
          data: { name: 'Priya Patel', role: 'Head of Product', company: 'Figma', quote: 'The visibility Meridian gives us across all projects is incredible. Our PMs finally have a single source of truth.', avatar: '/images/avatar-priya.jpg', rating: 5 },
        },
        {
          id: 'ti-4', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-17T10:00:00Z',
          data: { name: 'James Wright', role: 'Engineering Manager', company: 'Vercel', quote: 'Onboarding new engineers used to take two weeks. With Meridian\'s systems, they\'re contributing on day one.', avatar: '/images/avatar-james.jpg', rating: 5 },
        },
        {
          id: 'ti-5', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-16T10:00:00Z',
          data: { name: 'Elena Rodriguez', role: 'Director of Operations', company: 'Notion', quote: 'We went from shipping monthly to shipping daily. Meridian removed every bottleneck in our pipeline.', avatar: '/images/avatar-elena.jpg', rating: 4 },
        },
        {
          id: 'ti-6', status: 'published', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z',
          data: { name: 'David Kim', role: 'Founder', company: 'Arc Browser', quote: 'As a small team, we needed a studio that just gets it. Meridian is that rare partner that\'s powerful and easy to work with.', avatar: '/images/avatar-david.jpg', rating: 5 },
        },
      ],
    },
    {
      id: 'ct-blog',
      name: 'Blog Posts',
      linkedPages: ['page-blog', 'page-blog-post'],
      fields: [
        { id: 'f-blog-title', name: 'Title', type: 'text', required: true },
        { id: 'f-blog-slug', name: 'Slug', type: 'text', required: true },
        { id: 'f-blog-excerpt', name: 'Excerpt', type: 'text', required: true },
        { id: 'f-blog-body', name: 'Body', type: 'richtext', required: true },
        { id: 'f-blog-cover', name: 'Cover Image', type: 'image', required: true },
        { id: 'f-blog-author', name: 'Author', type: 'text', required: true },
        { id: 'f-blog-date', name: 'Published Date', type: 'date', required: true },
        { id: 'f-blog-category', name: 'Category', type: 'select', required: false },
      ],
      items: [
        {
          id: 'bi-1', status: 'published', createdAt: '2026-03-15T09:00:00Z', updatedAt: '2026-03-22T09:00:00Z',
          data: { title: 'Why We Built Meridian Studio: Our Origin Story', slug: 'why-we-built-meridian', excerpt: 'Every great studio starts with a frustration. Here\'s ours.', body: '<p>In 2022, our founding team was working at a fast-growing startup...</p>', cover: '/images/blog-origin.jpg', author: 'Alex Rivera', date: '2026-03-22', category: 'Company' },
        },
        {
          id: 'bi-2', status: 'published', createdAt: '2026-03-08T09:00:00Z', updatedAt: '2026-03-15T09:00:00Z',
          data: { title: 'The Hidden Cost of Context Switching', slug: 'hidden-cost-context-switching', excerpt: 'Research shows engineers lose 23 minutes every time they switch tasks. Here\'s how to fix it.', body: '<p>A 2024 study from the University of California found that...</p>', cover: '/images/blog-context.jpg', author: 'Maya Thompson', date: '2026-03-15', category: 'Productivity' },
        },
        {
          id: 'bi-3', status: 'published', createdAt: '2026-03-01T09:00:00Z', updatedAt: '2026-03-08T09:00:00Z',
          data: { title: 'Announcing Meridian 2.0: Workflows, AI, and More', slug: 'meridian-2-launch', excerpt: 'Our biggest release yet brings AI-powered workflows and 40+ new integrations.', body: '<p>Today we\'re thrilled to announce Meridian 2.0...</p>', cover: '/images/blog-v2.jpg', author: 'Alex Rivera', date: '2026-03-08', category: 'Product' },
        },
        {
          id: 'bi-4', status: 'draft', createdAt: '2026-02-20T09:00:00Z', updatedAt: '2026-03-01T09:00:00Z',
          data: { title: 'How Ramp Cut Their Sprint Cycle by 60%', slug: 'ramp-case-study', excerpt: 'An inside look at how one of fintech\'s fastest-growing companies transformed their engineering workflow.', body: '<p>When Marcus Johnson joined Ramp as CTO in early 2025...</p>', cover: '/images/blog-ramp.jpg', author: 'Jordan Lee', date: '2026-03-01', category: 'Case Study' },
        },
      ],
    },
    {
      id: 'ct-team',
      name: 'Team Members',
      linkedPages: ['page-team', 'page-about'],
      fields: [
        { id: 'f-tm-name', name: 'Name', type: 'text', required: true },
        { id: 'f-tm-role', name: 'Role', type: 'text', required: true },
        { id: 'f-tm-bio', name: 'Bio', type: 'richtext', required: false },
        { id: 'f-tm-photo', name: 'Photo', type: 'image', required: true },
        { id: 'f-tm-linkedin', name: 'LinkedIn', type: 'url', required: false },
        { id: 'f-tm-twitter', name: 'Twitter', type: 'url', required: false },
      ],
      items: [
        {
          id: 'tm-1', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
          data: { name: 'Alex Rivera', role: 'Co-Founder & CEO', bio: 'Former engineering lead at Stripe. Passionate about developer tools and removing friction from software delivery.', photo: '/images/team-alex.jpg', linkedin: 'https://linkedin.com/in/alexrivera', twitter: 'https://twitter.com/alexrivera' },
        },
        {
          id: 'tm-2', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
          data: { name: 'Jordan Lee', role: 'Co-Founder & CTO', bio: 'Previously built infrastructure at Datadog. Believes the best tools are the ones you forget you\'re using.', photo: '/images/team-jordan.jpg', linkedin: 'https://linkedin.com/in/jordanlee', twitter: 'https://twitter.com/jordanlee' },
        },
        {
          id: 'tm-3', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
          data: { name: 'Maya Thompson', role: 'Head of Product', bio: 'Spent 6 years at Atlassian shaping Jira and Confluence. Now focused on building the tools she always wished existed.', photo: '/images/team-maya.jpg', linkedin: 'https://linkedin.com/in/mayathompson' },
        },
        {
          id: 'tm-4', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
          data: { name: 'Raj Mehta', role: 'Head of Engineering', bio: 'Full-stack engineer with a background in distributed systems. Previously at Cloudflare.', photo: '/images/team-raj.jpg', linkedin: 'https://linkedin.com/in/rajmehta' },
        },
        {
          id: 'tm-5', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z',
          data: { name: 'Sophie Andersen', role: 'Head of Design', bio: 'Design leader who shaped products at Linear and InVision. Obsessed with clarity and craft.', photo: '/images/team-sophie.jpg', linkedin: 'https://linkedin.com/in/sophieandersen', twitter: 'https://twitter.com/sophieandersen' },
        },
      ],
    },
    {
      id: 'ct-faqs',
      name: 'FAQs',
      linkedPages: ['page-faq'],
      fields: [
        { id: 'f-faq-question', name: 'Question', type: 'text', required: true },
        { id: 'f-faq-answer', name: 'Answer', type: 'richtext', required: true },
        { id: 'f-faq-category', name: 'Category', type: 'select', required: false },
        { id: 'f-faq-order', name: 'Display Order', type: 'number', required: false },
      ],
      items: [
        { id: 'faq-1', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'What services does Meridian Studio offer?', answer: 'We offer brand identity, web design, UI/UX design, and full-stack development services for startups and scale-ups.', category: 'General', order: 1 } },
        { id: 'faq-2', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'How long does a typical project take?', answer: 'Most projects take 4-8 weeks depending on scope. We provide a detailed timeline during our discovery phase.', category: 'Process', order: 2 } },
        { id: 'faq-3', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'Do you work with early-stage startups?', answer: 'Absolutely. We have special packages designed for pre-seed and seed-stage companies. Apply through our startup program page.', category: 'General', order: 3 } },
        { id: 'faq-4', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'What is your design process?', answer: 'We follow a four-phase approach: Discovery, Design, Development, and Launch. Each phase includes client checkpoints and feedback loops.', category: 'Process', order: 4 } },
        { id: 'faq-5', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'Do you offer ongoing maintenance?', answer: 'Yes. We offer monthly retainer packages for ongoing updates, performance monitoring, and content changes.', category: 'Support', order: 5 } },
        { id: 'faq-6', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'What technologies do you use?', answer: 'We primarily work with React, Next.js, TypeScript, and Tailwind CSS. For CMS, we recommend Sanity or Contentful depending on the project.', category: 'Technical', order: 6 } },
        { id: 'faq-7', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'Can I see examples of your work?', answer: 'Yes! Visit our portfolio page to see case studies from clients like Ramp, Lattice, and Arc Browser.', category: 'General', order: 7 } },
        { id: 'faq-8', status: 'published', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z', data: { question: 'How do I get started?', answer: 'Fill out our contact form or email hello@meridianstudio.design. We\'ll schedule a free 30-minute discovery call within 48 hours.', category: 'General', order: 8 } },
      ],
    },
  ],

  // ── Media Assets ───────────────────────────────────────────────────────────
  media: [
    { id: 'ma-1', name: 'meridian-logo.svg', type: 'svg', size: '4 KB', optimized: true, usedIn: ['sec-home-header', 'sec-about-header'] },
    { id: 'ma-2', name: 'meridian-logo-white.svg', type: 'svg', size: '4 KB', optimized: true, usedIn: ['sec-home-footer'] },
    { id: 'ma-3', name: 'hero-dashboard.png', type: 'image', size: '820 KB', dimensions: '2400x1600', optimized: false, usedIn: ['sec-home-hero'] },
    { id: 'ma-4', name: 'team-photo.jpg', type: 'image', size: '540 KB', dimensions: '1920x1080', optimized: true, usedIn: ['sec-about-hero'] },
    { id: 'ma-5', name: 'careers-hero.jpg', type: 'image', size: '480 KB', dimensions: '1920x1080', optimized: true, usedIn: ['sec-careers-hero'] },
    { id: 'ma-6', name: 'blog-origin.jpg', type: 'image', size: '320 KB', dimensions: '1200x630', optimized: true, usedIn: ['sec-blog-list'] },
    { id: 'ma-7', name: 'blog-context.jpg', type: 'image', size: '290 KB', dimensions: '1200x630', optimized: true, usedIn: ['sec-blog-list'] },
    { id: 'ma-8', name: 'blog-v2.jpg', type: 'image', size: '350 KB', dimensions: '1200x630', optimized: true, usedIn: ['sec-blog-list'] },
    { id: 'ma-9', name: 'blog-ramp.jpg', type: 'image', size: '310 KB', dimensions: '1200x630', optimized: true, usedIn: ['sec-blog-list'] },
    { id: 'ma-10', name: 'og-image.png', type: 'image', size: '180 KB', dimensions: '1200x630', optimized: false, usedIn: [] },
    { id: 'ma-11', name: 'favicon.svg', type: 'svg', size: '2 KB', optimized: true, usedIn: [] },
    { id: 'ma-12', name: 'pattern-grid.svg', type: 'svg', size: '6 KB', optimized: true, usedIn: ['sec-home-hero', 'sec-home-cta'] },
    { id: 'ma-13', name: 'portfolio-ramp.jpg', type: 'image', size: '620 KB', dimensions: '1600x900', optimized: true, usedIn: ['sec-portfolio-grid'] },
    { id: 'ma-14', name: 'portfolio-arc.jpg', type: 'image', size: '580 KB', dimensions: '1600x900', optimized: true, usedIn: ['sec-portfolio-grid'] },
  ],

  // ── Tech Sectors ───────────────────────────────────────────────────────────
  sectors: [
    {
      id: 'sector-frontend',
      name: 'Frontend',
      icon: 'Code2',
      status: 'connected',
      description: 'Framework, components, and build tooling for your website',
      automation: 'automated',
      providers: [
        { id: 'prov-nextjs', name: 'Next.js', description: 'Full-stack React framework with SSR, SSG, and API routes. The most popular choice for production React apps.', price: 'Free', recommended: true, tier: 'balanced' },
        { id: 'prov-vite-react', name: 'Vite + React', description: 'Lightweight and blazing-fast SPA build tool. Ideal for client-side apps without server rendering needs.', price: 'Free', tier: 'budget' },
        { id: 'prov-astro', name: 'Astro', description: 'Content-focused framework with partial hydration. Ships zero JS by default for maximum performance.', price: 'Free', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-fe1', label: 'Framework detected', description: 'Identify the frontend framework and version', completed: true, automation: 'auto' },
        { id: 'task-fe2', label: 'Component architecture analyzed', description: 'Map all reusable components and their dependencies', completed: true, automation: 'auto' },
        { id: 'task-fe3', label: 'Build pipeline configured', description: 'Set up build commands, output directories, and environment variables', completed: true, automation: 'auto' },
        { id: 'task-fe4', label: 'TypeScript types generated', description: 'Create typed interfaces for all content and API contracts', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-cms',
      name: 'CMS',
      icon: 'Database',
      status: 'ready',
      description: 'How you manage and update your website content',
      automation: 'automated',
      providers: [
        { id: 'prov-sanity', name: 'Sanity', description: 'Real-time collaborative CMS with a customizable editing studio and powerful GROQ query language.', price: 'Free - $99/mo', recommended: true, tier: 'balanced' },
        { id: 'prov-markdown', name: 'Markdown Files', description: 'Content stored as Markdown files in your repository. No external dependencies.', price: 'Free', tier: 'budget' },
        { id: 'prov-contentful', name: 'Contentful', description: 'Enterprise headless CMS with advanced localization, workflows, and a robust API.', price: 'Free - $489/mo', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-c1', label: 'Content extracted from templates', description: 'Pull all content from your imported site into structured collections', completed: true, automation: 'auto' },
        { id: 'task-c2', label: 'Content schemas generated', description: 'Create typed schemas for each content collection', completed: true, automation: 'auto' },
        { id: 'task-c3', label: 'CMS provider connected', description: 'Link an external CMS for ongoing content editing', completed: false, automation: 'manual' },
      ],
    },
    {
      id: 'sector-database',
      name: 'Database',
      icon: 'HardDrive',
      status: 'not-started',
      description: 'Persistent data storage for dynamic content and user data',
      automation: 'guided',
      providers: [
        { id: 'prov-supabase', name: 'Supabase', description: 'Open-source Firebase alternative with Postgres, auth, realtime subscriptions, and storage.', price: 'Free - $25/mo', recommended: true, tier: 'balanced' },
        { id: 'prov-planetscale', name: 'PlanetScale', description: 'Serverless MySQL with branching, non-blocking schema changes, and unlimited connections.', price: 'Free - $29/mo', tier: 'scale' },
        { id: 'prov-turso', name: 'Turso', description: 'Edge-hosted SQLite with global replication. Ideal for read-heavy workloads.', price: 'Free - $29/mo', tier: 'budget' },
      ],
      tasks: [
        { id: 'task-db1', label: 'Database requirements assessed', description: 'Determine what dynamic data needs persistent storage', completed: false, automation: 'auto' },
        { id: 'task-db2', label: 'Schema designed', description: 'Create database tables and relationships based on content model', completed: false, automation: 'auto' },
        { id: 'task-db3', label: 'Database provisioned', description: 'Create and connect the database instance', completed: false, automation: 'manual' },
        { id: 'task-db4', label: 'Seed data migrated', description: 'Import existing content into the new database', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-hosting',
      name: 'Hosting',
      icon: 'Globe',
      status: 'needs-setup',
      description: 'Where your website lives and how it gets deployed',
      automation: 'automated',
      providers: [
        { id: 'prov-vercel', name: 'Vercel', description: 'Edge-optimized hosting built for Next.js and modern frameworks. Best for dynamic sites at scale.', price: 'Free - $20/mo', recommended: true, tier: 'balanced' },
        { id: 'prov-netlify', name: 'Netlify', description: 'Modern web hosting with CI/CD, forms, and serverless functions built in.', price: 'Free - $19/mo', tier: 'balanced' },
        { id: 'prov-gh-pages', name: 'GitHub Pages', description: 'Free static hosting with GitHub integration. Best for simple sites with low traffic.', price: 'Free', tier: 'budget' },
        { id: 'prov-aws-amplify', name: 'AWS Amplify', description: 'Full-stack hosting with backend APIs, auth, and storage. Enterprise-grade infrastructure.', price: 'Pay-per-use', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-h1', label: 'Hosting provider selected', description: 'Choose a hosting platform that fits your needs', completed: false, automation: 'manual' },
        { id: 'task-h2', label: 'Build settings configured', description: 'Set up build commands and output directories', completed: false, automation: 'auto' },
        { id: 'task-h3', label: 'Preview deployment created', description: 'Create a test deployment to verify everything works', completed: false, automation: 'auto' },
        { id: 'task-h4', label: 'Production deployment live', description: 'Deploy to production with your custom domain', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-domain',
      name: 'Domain & DNS',
      icon: 'Link',
      status: 'not-started',
      description: 'Your custom domain name and DNS configuration',
      automation: 'guided',
      providers: [
        { id: 'prov-cloudflare-dns', name: 'Cloudflare Registrar', description: 'Domain registration at wholesale prices with built-in DDoS protection and CDN.', price: 'At-cost (~$10/yr)', recommended: true, tier: 'balanced' },
        { id: 'prov-namecheap', name: 'Namecheap', description: 'Affordable domain registration with free WhoisGuard privacy.', price: '$8.88/yr', tier: 'budget' },
        { id: 'prov-route53', name: 'Amazon Route 53', description: 'Enterprise-grade DNS with 100% SLA and advanced routing policies.', price: '$12/yr + $0.50/zone/mo', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-d1', label: 'Domain registered', description: 'Secure your domain name with a registrar', completed: false, automation: 'manual' },
        { id: 'task-d2', label: 'DNS records configured', description: 'Point your domain to your hosting provider with A and CNAME records', completed: false, automation: 'auto' },
        { id: 'task-d3', label: 'SSL certificate provisioned', description: 'Generate and install an SSL certificate for HTTPS', completed: false, automation: 'auto' },
        { id: 'task-d4', label: 'WWW redirect setup', description: 'Configure www to non-www (or vice versa) redirect', completed: false, automation: 'auto' },
        { id: 'task-d5', label: 'Subdomain configuration', description: 'Set up subdomains for staging, docs, or other environments', completed: false, automation: 'manual' },
      ],
    },
    {
      id: 'sector-security',
      name: 'Security',
      icon: 'Shield',
      status: 'not-started',
      description: 'HTTPS certificates, security headers, and vulnerability protection',
      automation: 'automated',
      providers: [
        { id: 'prov-letsencrypt', name: "Let's Encrypt", description: 'Free, automated SSL certificates trusted by all browsers. Renews every 90 days.', price: 'Free', recommended: true, tier: 'budget' },
        { id: 'prov-cloudflare-ssl', name: 'Cloudflare SSL', description: 'Universal SSL with edge certificates and full strict mode. Includes DDoS protection.', price: 'Free - $20/mo', tier: 'balanced' },
        { id: 'prov-digicert', name: 'DigiCert', description: 'Enterprise SSL with EV certificates, wildcard support, and dedicated validation team.', price: '$268/yr', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-sec1', label: 'SSL certificate provisioned', description: 'Generate and install an SSL certificate for your domain', completed: false, automation: 'auto' },
        { id: 'task-sec2', label: 'HTTPS redirect enabled', description: 'Force all traffic through HTTPS', completed: false, automation: 'auto' },
        { id: 'task-sec3', label: 'Security headers configured', description: 'Add HSTS, CSP, X-Frame-Options, and other security headers', completed: false, automation: 'auto' },
        { id: 'task-sec4', label: 'Dependency vulnerabilities scanned', description: 'Check npm packages for known security issues', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-media',
      name: 'Assets & Media',
      icon: 'Image',
      status: 'needs-setup',
      description: 'Image optimization, asset delivery, and media management',
      automation: 'automated',
      providers: [
        { id: 'prov-cloudinary', name: 'Cloudinary', description: 'Automatic image and video optimization with on-the-fly transformations and a global CDN.', price: 'Free - $89/mo', recommended: true, tier: 'balanced' },
        { id: 'prov-imgix', name: 'imgix', description: 'Real-time image processing with a powerful URL-based API. Best for high-volume media.', price: '$10/mo', tier: 'scale' },
        { id: 'prov-sharp', name: 'Sharp (Self-hosted)', description: 'High-performance Node.js image processing. Process images at build time with no external dependency.', price: 'Free', tier: 'budget' },
      ],
      tasks: [
        { id: 'task-med1', label: 'Images audited', description: 'Analyze all images for size, format, and optimization opportunities', completed: true, automation: 'auto' },
        { id: 'task-med2', label: 'Images optimized', description: 'Compress and convert images to modern formats (WebP/AVIF)', completed: false, automation: 'auto' },
        { id: 'task-med3', label: 'CDN delivery configured', description: 'Serve assets through a content delivery network', completed: false, automation: 'auto' },
        { id: 'task-med4', label: 'Responsive images generated', description: 'Create multiple sizes for srcset and responsive loading', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-analytics',
      name: 'Analytics',
      icon: 'BarChart3',
      status: 'not-started',
      description: 'Understand how visitors interact with your site',
      automation: 'guided',
      providers: [
        { id: 'prov-plausible', name: 'Plausible', description: 'Privacy-friendly analytics with no cookies required. Lightweight script under 1KB.', price: '$9/mo', tier: 'budget' },
        { id: 'prov-posthog', name: 'PostHog', description: 'Product analytics, session recording, feature flags, and A/B testing in one platform.', price: 'Free - usage-based', recommended: true, tier: 'balanced' },
        { id: 'prov-ga4', name: 'Google Analytics 4', description: 'Industry-standard analytics with advanced attribution modeling, BigQuery export, and AI insights.', price: 'Free - enterprise', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-an1', label: 'Analytics provider selected', description: 'Choose a platform that fits your privacy and data needs', completed: false, automation: 'manual' },
        { id: 'task-an2', label: 'Tracking snippet installed', description: 'Add the analytics script to your site', completed: false, automation: 'auto' },
        { id: 'task-an3', label: 'Conversion goals configured', description: 'Define what counts as a conversion on your site', completed: false, automation: 'manual' },
        { id: 'task-an4', label: 'Dashboard created', description: 'Set up a custom dashboard for key metrics', completed: false, automation: 'manual' },
      ],
    },
    {
      id: 'sector-seo',
      name: 'SEO',
      icon: 'Search',
      status: 'needs-setup',
      description: 'Search engine optimization, meta tags, and structured data',
      automation: 'automated',
      providers: [
        { id: 'prov-solo-seo', name: 'HostaPosta Built-in SEO', description: 'Automatic meta tags, sitemap generation, and robots.txt based on your content.', price: 'Included', recommended: true, tier: 'budget' },
        { id: 'prov-yoast', name: 'Yoast SEO', description: 'Comprehensive SEO toolkit with readability analysis, schema markup, and redirect management.', price: '$99/yr', tier: 'balanced' },
        { id: 'prov-ahrefs', name: 'Ahrefs Webmaster Tools', description: 'Advanced SEO audit, backlink analysis, and keyword research platform.', price: 'Free - $99/mo', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-seo1', label: 'Meta tags audited', description: 'Scan all pages for missing or incomplete meta information', completed: true, automation: 'auto' },
        { id: 'task-seo2', label: 'Sitemap generated', description: 'Create a sitemap.xml from your page structure', completed: false, automation: 'auto' },
        { id: 'task-seo3', label: 'Structured data added (JSON-LD)', description: 'Add schema.org markup for rich search results', completed: false, automation: 'auto' },
        { id: 'task-seo4', label: 'Open Graph tags configured', description: 'Set up social sharing previews for each page', completed: false, automation: 'auto' },
        { id: 'task-seo5', label: 'Robots.txt configured', description: 'Create robots.txt with proper crawl directives', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-aeo',
      name: 'AEO',
      icon: 'Sparkles',
      status: 'not-started',
      description: 'AI Engine Optimization for AI search and assistant visibility',
      automation: 'guided',
      providers: [
        { id: 'prov-solo-aeo', name: 'HostaPosta Built-in AEO', description: 'Structured content annotations and AI-friendly markup to improve visibility in AI search results.', price: 'Included', recommended: true, tier: 'budget' },
        { id: 'prov-schema-pro', name: 'Schema Pro', description: 'Advanced structured data generator with support for 35+ schema types and automated testing.', price: '$79/yr', tier: 'balanced' },
        { id: 'prov-clearscope', name: 'Clearscope', description: 'AI-powered content optimization that helps you create comprehensive, entity-rich content.', price: '$170/mo', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-aeo1', label: 'Content entity mapping', description: 'Identify and annotate key entities across your site content', completed: false, automation: 'auto' },
        { id: 'task-aeo2', label: 'FAQ schema added', description: 'Add FAQ structured data for AI assistant answers', completed: false, automation: 'auto' },
        { id: 'task-aeo3', label: 'Conversational content audit', description: 'Review content for natural language query relevance', completed: false, automation: 'manual' },
        { id: 'task-aeo4', label: 'AI citation optimization', description: 'Structure content to be easily cited by AI assistants', completed: false, automation: 'auto' },
      ],
    },
    {
      id: 'sector-legal',
      name: 'Legal & Utility',
      icon: 'FileCheck',
      status: 'not-started',
      description: 'Privacy policy, terms of service, cookie consent, and compliance pages',
      automation: 'guided',
      providers: [
        { id: 'prov-iubenda', name: 'iubenda', description: 'Auto-generated privacy and cookie policies that stay compliant with GDPR, CCPA, and other regulations.', price: 'Free - $29/yr', recommended: true, tier: 'budget' },
        { id: 'prov-termly', name: 'Termly', description: 'Compliance management platform with policy generators, consent management, and cookie scanning.', price: '$10/mo', tier: 'balanced' },
        { id: 'prov-osano', name: 'Osano', description: 'Enterprise consent management with vendor monitoring, data mapping, and regulatory compliance dashboard.', price: 'Custom pricing', tier: 'scale' },
      ],
      tasks: [
        { id: 'task-leg1', label: 'Privacy policy generated', description: 'Create a GDPR/CCPA-compliant privacy policy', completed: false, automation: 'auto' },
        { id: 'task-leg2', label: 'Terms of service created', description: 'Generate terms of service tailored to your business model', completed: false, automation: 'auto' },
        { id: 'task-leg3', label: 'Cookie consent banner configured', description: 'Add a compliant cookie consent banner with category controls', completed: false, automation: 'manual' },
        { id: 'task-leg4', label: 'Accessibility statement added', description: 'Create an accessibility statement and conduct a basic audit', completed: false, automation: 'manual' },
      ],
    },
  ],

  // ── Readiness Items ────────────────────────────────────────────────────────
  readinessItems: [
    { id: 'ri-1', label: 'Content extracted and structured', description: 'All content has been pulled from your templates into editable collections', status: 'complete', sector: 'sector-cms', automation: 'automated' },
    { id: 'ri-2', label: 'Frontend framework detected', description: 'React 18 with TypeScript and Vite identified and configured', status: 'complete', sector: 'sector-frontend', automation: 'automated' },
    { id: 'ri-3', label: 'Page structure analyzed', description: 'All 10 pages and their sections have been identified and mapped', status: 'complete', sector: 'sector-cms', automation: 'automated' },
    { id: 'ri-4', label: 'SEO audit complete', description: 'Meta tags scanned; 4 pages need attention', status: 'in-progress', sector: 'sector-seo', automation: 'automated' },
    { id: 'ri-5', label: 'Media assets audited', description: '14 assets analyzed; 2 images need optimization', status: 'complete', sector: 'sector-media', automation: 'automated' },
    { id: 'ri-6', label: 'Hosting provider selected', description: 'No hosting provider connected yet - required before launch', status: 'blocked', sector: 'sector-hosting', automation: 'guided' },
    { id: 'ri-7', label: 'Custom domain configured', description: 'Register or connect a custom domain for your site', status: 'not-started', sector: 'sector-domain', automation: 'guided' },
    { id: 'ri-8', label: 'SSL certificate provisioned', description: 'HTTPS needs to be enabled before launch', status: 'not-started', sector: 'sector-security', automation: 'automated' },
    { id: 'ri-9', label: 'Analytics installed', description: 'No analytics tracking configured yet', status: 'not-started', sector: 'sector-analytics', automation: 'guided' },
    { id: 'ri-10', label: 'Database provisioned', description: 'No database connected for dynamic content storage', status: 'not-started', sector: 'sector-database', automation: 'guided' },
    { id: 'ri-11', label: 'Image optimization complete', description: '2 images exceed recommended size and need compression', status: 'blocked', sector: 'sector-media', automation: 'automated' },
    { id: 'ri-12', label: 'Legal pages generated', description: 'Privacy policy and terms of service not yet created', status: 'not-started', sector: 'sector-legal', automation: 'guided' },
    { id: 'ri-13', label: 'Open Graph tags configured', description: 'Social sharing previews missing on most pages', status: 'blocked', sector: 'sector-seo', automation: 'automated' },
    { id: 'ri-14', label: 'AEO structured data added', description: 'AI engine optimization markup not yet configured', status: 'not-started', sector: 'sector-aeo', automation: 'guided' },
    { id: 'ri-15', label: 'Cookie consent configured', description: 'Cookie consent banner required for GDPR compliance', status: 'not-started', sector: 'sector-legal', automation: 'guided' },
  ],
};
