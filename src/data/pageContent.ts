export interface EditableElement {
  id: string;
  type: 'heading' | 'text' | 'image' | 'button' | 'link' | 'stat' | 'logo-grid' | 'form-field';
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  content?: string;
  alt?: string;
  href?: string;
  placeholder?: string;
  width?: number;
  height?: number;
}

export interface PageSection {
  id: string;
  name: string;
  type: 'nav' | 'hero' | 'logos' | 'features' | 'stats' | 'testimonials' | 'cta' | 'footer' | 'blog-grid' | 'article' | 'team-grid' | 'contact-form';
  elements: EditableElement[];
}

export interface PageContent {
  pageId: string;
  sections: PageSection[];
}

// ─── Shared nav and footer ───────────────────────────────────────────

const sharedNav: PageSection = {
  id: 'nav',
  name: 'Navigation',
  type: 'nav',
  elements: [
    { id: 'nav-logo', type: 'text', tag: 'span', content: 'Meridian Studio' },
    { id: 'nav-link-home', type: 'link', content: 'Home', href: '/' },
    { id: 'nav-link-about', type: 'link', content: 'About', href: '/about' },
    { id: 'nav-link-blog', type: 'link', content: 'Blog', href: '/blog' },
    { id: 'nav-link-team', type: 'link', content: 'Team', href: '/team' },
    { id: 'nav-link-contact', type: 'link', content: 'Contact', href: '/contact' },
    { id: 'nav-cta', type: 'button', content: 'Start a Project', href: '/contact' },
  ],
};

const sharedFooter: PageSection = {
  id: 'footer',
  name: 'Footer',
  type: 'footer',
  elements: [
    { id: 'footer-logo', type: 'text', tag: 'span', content: 'Meridian Studio' },
    {
      id: 'footer-description',
      type: 'text',
      tag: 'p',
      content:
        'Award-winning design studio crafting digital experiences that move people forward. Based in Brooklyn, working worldwide.',
    },
    { id: 'footer-col1-heading', type: 'heading', tag: 'h4', content: 'Studio' },
    { id: 'footer-col1-link1', type: 'link', content: 'About Us', href: '/about' },
    { id: 'footer-col1-link2', type: 'link', content: 'Our Team', href: '/team' },
    { id: 'footer-col1-link3', type: 'link', content: 'Careers', href: '/careers' },
    { id: 'footer-col1-link4', type: 'link', content: 'Blog', href: '/blog' },
    { id: 'footer-col2-heading', type: 'heading', tag: 'h4', content: 'Services' },
    { id: 'footer-col2-link1', type: 'link', content: 'Brand Identity', href: '/services/brand' },
    { id: 'footer-col2-link2', type: 'link', content: 'Web Design', href: '/services/web' },
    { id: 'footer-col2-link3', type: 'link', content: 'Product Design', href: '/services/product' },
    { id: 'footer-col2-link4', type: 'link', content: 'Motion Design', href: '/services/motion' },
    { id: 'footer-col3-heading', type: 'heading', tag: 'h4', content: 'Connect' },
    { id: 'footer-col3-link1', type: 'link', content: 'Twitter', href: 'https://twitter.com' },
    { id: 'footer-col3-link2', type: 'link', content: 'Instagram', href: 'https://instagram.com' },
    { id: 'footer-col3-link3', type: 'link', content: 'Dribbble', href: 'https://dribbble.com' },
    { id: 'footer-col3-link4', type: 'link', content: 'LinkedIn', href: 'https://linkedin.com' },
    {
      id: 'footer-copyright',
      type: 'text',
      tag: 'p',
      content: '\u00a9 2026 Meridian Studio. All rights reserved.',
    },
    { id: 'footer-privacy', type: 'link', content: 'Privacy Policy', href: '/privacy' },
    { id: 'footer-terms', type: 'link', content: 'Terms of Service', href: '/terms' },
  ],
};

// ─── Home Page ───────────────────────────────────────────────────────

const homePage: PageContent = {
  pageId: 'page-home',
  sections: [
    { ...sharedNav, id: 'home-nav' },
    {
      id: 'home-hero',
      name: 'Hero',
      type: 'hero',
      elements: [
        {
          id: 'home-hero-heading',
          type: 'heading',
          tag: 'h1',
          content: 'We design brands that shape culture',
        },
        {
          id: 'home-hero-subheading',
          type: 'text',
          tag: 'p',
          content:
            'Meridian Studio is a multidisciplinary design practice specializing in brand identity, digital products, and creative strategy for forward-thinking companies.',
        },
        {
          id: 'home-hero-cta-primary',
          type: 'button',
          content: 'See Our Work',
          href: '/work',
        },
        {
          id: 'home-hero-cta-secondary',
          type: 'button',
          content: 'Get in Touch',
          href: '/contact',
        },
        {
          id: 'home-hero-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200&h=700&fit=crop',
          alt: 'Design studio workspace with creative materials',
          width: 1200,
          height: 700,
        },
      ],
    },
    {
      id: 'home-logos',
      name: 'Client Logos',
      type: 'logos',
      elements: [
        {
          id: 'home-logos-heading',
          type: 'text',
          tag: 'p',
          content: 'Trusted by teams that refuse to blend in',
        },
        { id: 'home-logo-1', type: 'logo-grid', content: 'Stripe', placeholder: 'Logo' },
        { id: 'home-logo-2', type: 'logo-grid', content: 'Notion', placeholder: 'Logo' },
        { id: 'home-logo-3', type: 'logo-grid', content: 'Figma', placeholder: 'Logo' },
        { id: 'home-logo-4', type: 'logo-grid', content: 'Linear', placeholder: 'Logo' },
        { id: 'home-logo-5', type: 'logo-grid', content: 'Vercel', placeholder: 'Logo' },
        { id: 'home-logo-6', type: 'logo-grid', content: 'Loom', placeholder: 'Logo' },
      ],
    },
    {
      id: 'home-features',
      name: 'Services',
      type: 'features',
      elements: [
        {
          id: 'home-features-label',
          type: 'text',
          tag: 'span',
          content: 'What We Do',
        },
        {
          id: 'home-features-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Comprehensive design services from concept to launch',
        },
        {
          id: 'home-features-description',
          type: 'text',
          tag: 'p',
          content:
            'We partner with startups, scale-ups, and enterprise teams to build brands and digital products people love.',
        },
        // Card 1 - Brand Identity
        {
          id: 'home-feature-1-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop',
          alt: 'Brand identity design process',
          width: 600,
          height: 400,
        },
        {
          id: 'home-feature-1-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Brand Identity',
        },
        {
          id: 'home-feature-1-text',
          type: 'text',
          tag: 'p',
          content:
            'Logo systems, visual language, brand guidelines, and naming. We distill your story into a cohesive identity that resonates with your audience and scales with your ambitions.',
        },
        {
          id: 'home-feature-1-link',
          type: 'link',
          content: 'Learn more \u2192',
          href: '/services/brand',
        },
        // Card 2 - Web Design
        {
          id: 'home-feature-2-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1547658719-da2b51169166?w=600&h=400&fit=crop',
          alt: 'Web design on a laptop screen',
          width: 600,
          height: 400,
        },
        {
          id: 'home-feature-2-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Web Design & Development',
        },
        {
          id: 'home-feature-2-text',
          type: 'text',
          tag: 'p',
          content:
            'Marketing sites, landing pages, and content platforms built with modern frameworks. Pixel-perfect design meets performance-first engineering.',
        },
        {
          id: 'home-feature-2-link',
          type: 'link',
          content: 'Learn more \u2192',
          href: '/services/web',
        },
        // Card 3 - Product Design
        {
          id: 'home-feature-3-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=600&h=400&fit=crop',
          alt: 'Mobile app UI design',
          width: 600,
          height: 400,
        },
        {
          id: 'home-feature-3-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Product Design',
        },
        {
          id: 'home-feature-3-text',
          type: 'text',
          tag: 'p',
          content:
            'End-to-end UX/UI for SaaS, mobile apps, and platforms. We run research, map user flows, design interfaces, and build interactive prototypes that validate ideas fast.',
        },
        {
          id: 'home-feature-3-link',
          type: 'link',
          content: 'Learn more \u2192',
          href: '/services/product',
        },
        // Card 4 - Motion & 3D
        {
          id: 'home-feature-4-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=400&fit=crop',
          alt: 'Motion design and 3D rendering',
          width: 600,
          height: 400,
        },
        {
          id: 'home-feature-4-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Motion & 3D',
        },
        {
          id: 'home-feature-4-text',
          type: 'text',
          tag: 'p',
          content:
            'Brand films, product animations, micro-interactions, and 3D visuals. We bring your brand to life with movement that captures attention and communicates instantly.',
        },
        {
          id: 'home-feature-4-link',
          type: 'link',
          content: 'Learn more \u2192',
          href: '/services/motion',
        },
      ],
    },
    {
      id: 'home-stats',
      name: 'Stats',
      type: 'stats',
      elements: [
        {
          id: 'home-stat-1-number',
          type: 'stat',
          tag: 'span',
          content: '200+',
        },
        {
          id: 'home-stat-1-label',
          type: 'text',
          tag: 'p',
          content: 'Projects delivered across 14 industries',
        },
        {
          id: 'home-stat-2-number',
          type: 'stat',
          tag: 'span',
          content: '12',
        },
        {
          id: 'home-stat-2-label',
          type: 'text',
          tag: 'p',
          content: 'Years of crafting award-winning design',
        },
        {
          id: 'home-stat-3-number',
          type: 'stat',
          tag: 'span',
          content: '98%',
        },
        {
          id: 'home-stat-3-label',
          type: 'text',
          tag: 'p',
          content: 'Client satisfaction rate and repeat partnerships',
        },
      ],
    },
    {
      id: 'home-testimonials',
      name: 'Testimonials',
      type: 'testimonials',
      elements: [
        {
          id: 'home-testimonials-label',
          type: 'text',
          tag: 'span',
          content: 'Client Stories',
        },
        {
          id: 'home-testimonials-heading',
          type: 'heading',
          tag: 'h2',
          content: "Don't take our word for it",
        },
        // Testimonial 1
        {
          id: 'home-testimonial-1-quote',
          type: 'text',
          tag: 'p',
          content:
            '\u201cMeridian completely transformed how our customers perceive our brand. The rebrand drove a 40% increase in qualified leads within the first quarter. Their strategic thinking is as sharp as their design.\u201d',
        },
        {
          id: 'home-testimonial-1-avatar',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
          alt: 'Sarah Chen headshot',
          width: 80,
          height: 80,
        },
        {
          id: 'home-testimonial-1-name',
          type: 'text',
          tag: 'span',
          content: 'Sarah Chen',
        },
        {
          id: 'home-testimonial-1-role',
          type: 'text',
          tag: 'span',
          content: 'VP of Marketing, Luminary Health',
        },
        // Testimonial 2
        {
          id: 'home-testimonial-2-quote',
          type: 'text',
          tag: 'p',
          content:
            '\u201cWorking with Meridian felt like adding a senior design team to our company overnight. They understood our product deeply and delivered an interface that our users genuinely love.\u201d',
        },
        {
          id: 'home-testimonial-2-avatar',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop',
          alt: 'James Okafor headshot',
          width: 80,
          height: 80,
        },
        {
          id: 'home-testimonial-2-name',
          type: 'text',
          tag: 'span',
          content: 'James Okafor',
        },
        {
          id: 'home-testimonial-2-role',
          type: 'text',
          tag: 'span',
          content: 'Co-founder & CEO, Stackline',
        },
        // Testimonial 3
        {
          id: 'home-testimonial-3-quote',
          type: 'text',
          tag: 'p',
          content:
            '\u201cFrom brand strategy through to a full website launch, Meridian kept our team aligned and excited. The final product exceeded every expectation we had going in.\u201d',
        },
        {
          id: 'home-testimonial-3-avatar',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop',
          alt: 'Maria Alvarez headshot',
          width: 80,
          height: 80,
        },
        {
          id: 'home-testimonial-3-name',
          type: 'text',
          tag: 'span',
          content: 'Maria Alvarez',
        },
        {
          id: 'home-testimonial-3-role',
          type: 'text',
          tag: 'span',
          content: 'Head of Brand, Canopy Finance',
        },
      ],
    },
    {
      id: 'home-cta',
      name: 'Call to Action',
      type: 'cta',
      elements: [
        {
          id: 'home-cta-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Ready to elevate your brand?',
        },
        {
          id: 'home-cta-text',
          type: 'text',
          tag: 'p',
          content:
            "Tell us about your project and we'll get back to you within 24 hours with a tailored proposal. No pitch decks, no fluff \u2014 just a clear plan to move forward.",
        },
        {
          id: 'home-cta-button',
          type: 'button',
          content: 'Start a Conversation',
          href: '/contact',
        },
      ],
    },
    { ...sharedFooter, id: 'home-footer' },
  ],
};

// ─── About Page ──────────────────────────────────────────────────────

const aboutPage: PageContent = {
  pageId: 'page-about',
  sections: [
    { ...sharedNav, id: 'about-nav' },
    {
      id: 'about-hero',
      name: 'About Hero',
      type: 'hero',
      elements: [
        {
          id: 'about-hero-label',
          type: 'text',
          tag: 'span',
          content: 'Our Story',
        },
        {
          id: 'about-hero-heading',
          type: 'heading',
          tag: 'h1',
          content: 'Design with intention, build with craft',
        },
        {
          id: 'about-hero-text-1',
          type: 'text',
          tag: 'p',
          content:
            'Meridian Studio was founded in 2014 with a simple conviction: great design is not decoration \u2014 it is a strategic tool that solves real problems. Over the past twelve years we have grown from a two-person partnership in a Williamsburg loft into a 28-person studio working with clients across five continents.',
        },
        {
          id: 'about-hero-text-2',
          type: 'text',
          tag: 'p',
          content:
            'We believe the best work happens at the intersection of rigorous strategy and fearless creativity. Every project starts with deep research and ends with meticulous execution. No templates, no shortcuts \u2014 just thoughtful design that earns attention and drives results.',
        },
        {
          id: 'about-hero-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=600&fit=crop',
          alt: 'Meridian Studio office space with team collaborating',
          width: 1200,
          height: 600,
        },
        {
          id: 'about-hero-text-3',
          type: 'text',
          tag: 'p',
          content:
            'Our approach blends the disciplines of graphic design, user-experience research, front-end engineering, and brand strategy into one seamless process. Clients work with a single, senior-led team from day one through launch and beyond.',
        },
        {
          id: 'about-values-heading',
          type: 'heading',
          tag: 'h2',
          content: 'What Guides Us',
        },
        {
          id: 'about-value-1-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Clarity Over Complexity',
        },
        {
          id: 'about-value-1-text',
          type: 'text',
          tag: 'p',
          content:
            'We strip away the unnecessary until only the essential remains. Good design communicates instantly and leaves a lasting impression.',
        },
        {
          id: 'about-value-2-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Collaboration as a Craft',
        },
        {
          id: 'about-value-2-text',
          type: 'text',
          tag: 'p',
          content:
            'Our best ideas emerge from open dialogue with our clients. We treat every engagement as a true partnership, not a vendor relationship.',
        },
        {
          id: 'about-value-3-heading',
          type: 'heading',
          tag: 'h3',
          content: 'Sweat the Details',
        },
        {
          id: 'about-value-3-text',
          type: 'text',
          tag: 'p',
          content:
            'Typography, spacing, motion curves, loading states \u2014 the details are not details. They are the product. We obsess so your users do not have to.',
        },
      ],
    },
    {
      id: 'about-stats',
      name: 'About Stats',
      type: 'stats',
      elements: [
        { id: 'about-stat-1-number', type: 'stat', tag: 'span', content: '28' },
        { id: 'about-stat-1-label', type: 'text', tag: 'p', content: 'Designers, strategists, and engineers' },
        { id: 'about-stat-2-number', type: 'stat', tag: 'span', content: '5' },
        { id: 'about-stat-2-label', type: 'text', tag: 'p', content: 'Continents with active clients' },
        { id: 'about-stat-3-number', type: 'stat', tag: 'span', content: '37' },
        { id: 'about-stat-3-label', type: 'text', tag: 'p', content: 'Industry awards and recognitions' },
      ],
    },
    {
      id: 'about-team-preview',
      name: 'Team Preview',
      type: 'team-grid',
      elements: [
        {
          id: 'about-team-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Meet the leadership',
        },
        {
          id: 'about-team-text',
          type: 'text',
          tag: 'p',
          content: 'A senior team with decades of combined experience across brand, product, and technology.',
        },
        // Member 1
        {
          id: 'about-team-1-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
          alt: 'Daniel Park headshot',
          width: 400,
          height: 400,
        },
        { id: 'about-team-1-name', type: 'text', tag: 'h3', content: 'Daniel Park' },
        { id: 'about-team-1-role', type: 'text', tag: 'p', content: 'Founder & Creative Director' },
        // Member 2
        {
          id: 'about-team-2-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop',
          alt: 'Anika Rao headshot',
          width: 400,
          height: 400,
        },
        { id: 'about-team-2-name', type: 'text', tag: 'h3', content: 'Anika Rao' },
        { id: 'about-team-2-role', type: 'text', tag: 'p', content: 'Partner & Strategy Lead' },
        // Member 3
        {
          id: 'about-team-3-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&h=400&fit=crop',
          alt: 'Marcus Webb headshot',
          width: 400,
          height: 400,
        },
        { id: 'about-team-3-name', type: 'text', tag: 'h3', content: 'Marcus Webb' },
        { id: 'about-team-3-role', type: 'text', tag: 'p', content: 'Head of Engineering' },
        {
          id: 'about-team-link',
          type: 'link',
          content: 'Meet the full team \u2192',
          href: '/team',
        },
      ],
    },
    {
      id: 'about-cta',
      name: 'Call to Action',
      type: 'cta',
      elements: [
        {
          id: 'about-cta-heading',
          type: 'heading',
          tag: 'h2',
          content: "Let's build something meaningful together",
        },
        {
          id: 'about-cta-text',
          type: 'text',
          tag: 'p',
          content:
            'Whether you are launching a new product or reimagining an existing brand, we would love to hear about it.',
        },
        { id: 'about-cta-button', type: 'button', content: 'Get in Touch', href: '/contact' },
      ],
    },
    { ...sharedFooter, id: 'about-footer' },
  ],
};

// ─── Blog Page ───────────────────────────────────────────────────────

const blogPage: PageContent = {
  pageId: 'page-blog',
  sections: [
    { ...sharedNav, id: 'blog-nav' },
    {
      id: 'blog-hero',
      name: 'Blog Header',
      type: 'hero',
      elements: [
        { id: 'blog-hero-label', type: 'text', tag: 'span', content: 'Insights' },
        {
          id: 'blog-hero-heading',
          type: 'heading',
          tag: 'h1',
          content: 'Thinking, process, and perspective',
        },
        {
          id: 'blog-hero-text',
          type: 'text',
          tag: 'p',
          content:
            'Notes from our studio on design, strategy, technology, and the evolving landscape of creative work.',
        },
      ],
    },
    {
      id: 'blog-grid',
      name: 'Blog Posts',
      type: 'blog-grid',
      elements: [
        // Post 1
        {
          id: 'blog-post-1-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=800&h=450&fit=crop',
          alt: 'Minimalist design system components on screen',
          width: 800,
          height: 450,
        },
        {
          id: 'blog-post-1-category',
          type: 'text',
          tag: 'span',
          content: 'Design Systems',
        },
        {
          id: 'blog-post-1-title',
          type: 'heading',
          tag: 'h3',
          content: 'Why Your Design System Is Failing (And How to Fix It)',
        },
        {
          id: 'blog-post-1-date',
          type: 'text',
          tag: 'span',
          content: 'March 12, 2026',
        },
        {
          id: 'blog-post-1-excerpt',
          type: 'text',
          tag: 'p',
          content:
            'Most design systems stall after the initial build. We break down the three most common failure modes and share the governance model we use with enterprise clients to keep systems alive and evolving.',
        },
        { id: 'blog-post-1-link', type: 'link', content: 'Read article \u2192', href: '/blog/design-system-failure' },
        // Post 2
        {
          id: 'blog-post-2-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=800&h=450&fit=crop',
          alt: 'Brand workshop with sticky notes on wall',
          width: 800,
          height: 450,
        },
        {
          id: 'blog-post-2-category',
          type: 'text',
          tag: 'span',
          content: 'Brand Strategy',
        },
        {
          id: 'blog-post-2-title',
          type: 'heading',
          tag: 'h3',
          content: 'The Brand Workshop Framework We Use With Every Client',
        },
        {
          id: 'blog-post-2-date',
          type: 'text',
          tag: 'span',
          content: 'February 28, 2026',
        },
        {
          id: 'blog-post-2-excerpt',
          type: 'text',
          tag: 'p',
          content:
            'A two-day workshop that surfaces brand truths, aligns stakeholders, and produces a creative brief that actually drives design decisions. Here is the full playbook.',
        },
        { id: 'blog-post-2-link', type: 'link', content: 'Read article \u2192', href: '/blog/brand-workshop' },
        // Post 3
        {
          id: 'blog-post-3-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1555421689-d68471e189f2?w=800&h=450&fit=crop',
          alt: 'Developer and designer pair programming',
          width: 800,
          height: 450,
        },
        {
          id: 'blog-post-3-category',
          type: 'text',
          tag: 'span',
          content: 'Process',
        },
        {
          id: 'blog-post-3-title',
          type: 'heading',
          tag: 'h3',
          content: 'Closing the Designer-Developer Gap Once and For All',
        },
        {
          id: 'blog-post-3-date',
          type: 'text',
          tag: 'span',
          content: 'February 10, 2026',
        },
        {
          id: 'blog-post-3-excerpt',
          type: 'text',
          tag: 'p',
          content:
            'Handoff tools are not enough. We share the workflow changes, shared language, and rituals that eliminated friction between our design and engineering teams.',
        },
        { id: 'blog-post-3-link', type: 'link', content: 'Read article \u2192', href: '/blog/designer-developer-gap' },
        // Post 4
        {
          id: 'blog-post-4-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop',
          alt: 'Analytics dashboard showing growth metrics',
          width: 800,
          height: 450,
        },
        {
          id: 'blog-post-4-category',
          type: 'text',
          tag: 'span',
          content: 'Case Study',
        },
        {
          id: 'blog-post-4-title',
          type: 'heading',
          tag: 'h3',
          content: 'How We Helped Canopy Finance 3x Their Conversion Rate',
        },
        {
          id: 'blog-post-4-date',
          type: 'text',
          tag: 'span',
          content: 'January 22, 2026',
        },
        {
          id: 'blog-post-4-excerpt',
          type: 'text',
          tag: 'p',
          content:
            'A deep dive into the research, redesign, and iterative testing process behind the Canopy Finance platform overhaul that tripled sign-up conversions in under six months.',
        },
        { id: 'blog-post-4-link', type: 'link', content: 'Read article \u2192', href: '/blog/canopy-case-study' },
      ],
    },
    { ...sharedFooter, id: 'blog-footer' },
  ],
};

// ─── Blog Post Page ──────────────────────────────────────────────────

const blogPostPage: PageContent = {
  pageId: 'page-blog-post',
  sections: [
    { ...sharedNav, id: 'blog-post-nav' },
    {
      id: 'blog-post-article',
      name: 'Article',
      type: 'article',
      elements: [
        {
          id: 'article-category',
          type: 'text',
          tag: 'span',
          content: 'Design Systems',
        },
        {
          id: 'article-title',
          type: 'heading',
          tag: 'h1',
          content: 'Why Your Design System Is Failing (And How to Fix It)',
        },
        {
          id: 'article-date',
          type: 'text',
          tag: 'span',
          content: 'March 12, 2026',
        },
        {
          id: 'article-read-time',
          type: 'text',
          tag: 'span',
          content: '10 min read',
        },
        {
          id: 'article-author-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop',
          alt: 'Anika Rao headshot',
          width: 80,
          height: 80,
        },
        {
          id: 'article-author-name',
          type: 'text',
          tag: 'span',
          content: 'Anika Rao',
        },
        {
          id: 'article-author-role',
          type: 'text',
          tag: 'span',
          content: 'Partner & Strategy Lead',
        },
        {
          id: 'article-hero-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=1200&h=600&fit=crop',
          alt: 'Design system components organized on a digital canvas',
          width: 1200,
          height: 600,
        },
        {
          id: 'article-intro',
          type: 'text',
          tag: 'p',
          content:
            'You invested months building a design system. The Figma library is spotless. The Storybook docs are thorough. The tokens are exported. And yet, six months after launch, adoption has stalled, teams are shipping one-off components, and the backlog of contribution requests is growing faster than your capacity.',
        },
        {
          id: 'article-body-h2-1',
          type: 'heading',
          tag: 'h2',
          content: 'The Three Failure Modes',
        },
        {
          id: 'article-body-p1',
          type: 'text',
          tag: 'p',
          content:
            'After auditing design systems at over thirty organizations, we have identified three recurring failure modes. Understanding which one afflicts your system is the first step toward recovery.',
        },
        {
          id: 'article-body-h3-1',
          type: 'heading',
          tag: 'h3',
          content: '1. The Ivory Tower',
        },
        {
          id: 'article-body-p2',
          type: 'text',
          tag: 'p',
          content:
            'The system is built in isolation by a centralized team that rarely ships product. Components are technically excellent but disconnected from the real constraints of product teams. Adoption falters because the system solves theoretical problems instead of practical ones.',
        },
        {
          id: 'article-body-h3-2',
          type: 'heading',
          tag: 'h3',
          content: '2. The Ghost Town',
        },
        {
          id: 'article-body-p3',
          type: 'text',
          tag: 'p',
          content:
            'The initial build shipped with fanfare, but the team was reassigned. Without dedicated maintenance, components drift out of date, bugs go unpatched, and product teams gradually abandon the system for custom solutions.',
        },
        {
          id: 'article-body-h3-3',
          type: 'heading',
          tag: 'h3',
          content: '3. The Frankenstein',
        },
        {
          id: 'article-body-p4',
          type: 'text',
          tag: 'p',
          content:
            'Too many contributors, too few guardrails. The system accepts every pull request and grows into an unwieldy collection of overlapping patterns. Teams cannot tell which component to use, so they build their own anyway.',
        },
        {
          id: 'article-body-h2-2',
          type: 'heading',
          tag: 'h2',
          content: 'A Governance Model That Works',
        },
        {
          id: 'article-body-p5',
          type: 'text',
          tag: 'p',
          content:
            'The fix is not more documentation or a stricter contribution policy. It is a governance model that balances centralized stewardship with distributed ownership. At Meridian, we call this the \u201cFederated Core\u201d model.',
        },
        {
          id: 'article-body-p6',
          type: 'text',
          tag: 'p',
          content:
            'A small, dedicated systems team owns the core primitives: color tokens, typography scales, spacing, layout grids, and foundational components like buttons, inputs, and modals. Product teams own \u201crecipe\u201d components built from those primitives \u2014 complex, domain-specific patterns like pricing cards or onboarding flows.',
        },
        {
          id: 'article-body-p7',
          type: 'text',
          tag: 'p',
          content:
            'A bi-weekly \u201csystem sync\u201d brings representatives from every product team together to review proposals, surface pain points, and promote battle-tested recipes into the core. This cadence keeps the system responsive without sacrificing coherence.',
        },
        {
          id: 'article-body-h2-3',
          type: 'heading',
          tag: 'h2',
          content: 'Start Here',
        },
        {
          id: 'article-body-p8',
          type: 'text',
          tag: 'p',
          content:
            'If your system is struggling, begin with a brutally honest audit. Interview five product designers and five engineers. Ask what they love, what they avoid, and what they have rebuilt from scratch. The answers will tell you which failure mode you are in \u2014 and which interventions will have the highest impact.',
        },
        {
          id: 'article-body-p9',
          type: 'text',
          tag: 'p',
          content:
            'Design systems are living organisms, not shipped artifacts. Treat them accordingly, and they will become the most powerful accelerator in your product organization.',
        },
      ],
    },
    {
      id: 'blog-post-related',
      name: 'Related Posts',
      type: 'blog-grid',
      elements: [
        {
          id: 'related-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Continue reading',
        },
        // Related 1
        {
          id: 'related-1-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=600&h=340&fit=crop',
          alt: 'Brand workshop with sticky notes',
          width: 600,
          height: 340,
        },
        {
          id: 'related-1-title',
          type: 'heading',
          tag: 'h3',
          content: 'The Brand Workshop Framework We Use With Every Client',
        },
        { id: 'related-1-date', type: 'text', tag: 'span', content: 'February 28, 2026' },
        { id: 'related-1-link', type: 'link', content: 'Read article \u2192', href: '/blog/brand-workshop' },
        // Related 2
        {
          id: 'related-2-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1555421689-d68471e189f2?w=600&h=340&fit=crop',
          alt: 'Developer and designer working together',
          width: 600,
          height: 340,
        },
        {
          id: 'related-2-title',
          type: 'heading',
          tag: 'h3',
          content: 'Closing the Designer-Developer Gap Once and For All',
        },
        { id: 'related-2-date', type: 'text', tag: 'span', content: 'February 10, 2026' },
        { id: 'related-2-link', type: 'link', content: 'Read article \u2192', href: '/blog/designer-developer-gap' },
      ],
    },
    { ...sharedFooter, id: 'blog-post-footer' },
  ],
};

// ─── Team Page ───────────────────────────────────────────────────────

const teamPage: PageContent = {
  pageId: 'page-team',
  sections: [
    { ...sharedNav, id: 'team-nav' },
    {
      id: 'team-hero',
      name: 'Team Header',
      type: 'hero',
      elements: [
        { id: 'team-hero-label', type: 'text', tag: 'span', content: 'Our People' },
        {
          id: 'team-hero-heading',
          type: 'heading',
          tag: 'h1',
          content: 'A team built on craft and curiosity',
        },
        {
          id: 'team-hero-text',
          type: 'text',
          tag: 'p',
          content:
            'Twenty-eight designers, strategists, and engineers united by a shared obsession with meaningful work. We come from diverse backgrounds but share common standards: sweat the details, stay curious, and always put the work first.',
        },
      ],
    },
    {
      id: 'team-grid',
      name: 'Team Members',
      type: 'team-grid',
      elements: [
        // Member 1
        {
          id: 'team-member-1-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
          alt: 'Daniel Park headshot',
          width: 400,
          height: 400,
        },
        { id: 'team-member-1-name', type: 'heading', tag: 'h3', content: 'Daniel Park' },
        { id: 'team-member-1-role', type: 'text', tag: 'p', content: 'Founder & Creative Director' },
        {
          id: 'team-member-1-bio',
          type: 'text',
          tag: 'p',
          content:
            'Daniel founded Meridian after a decade leading design at Collins and Pentagram. He oversees creative vision across every project and speaks regularly at AIGA, OFFF, and Brand New Conference.',
        },
        // Member 2
        {
          id: 'team-member-2-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop',
          alt: 'Anika Rao headshot',
          width: 400,
          height: 400,
        },
        { id: 'team-member-2-name', type: 'heading', tag: 'h3', content: 'Anika Rao' },
        { id: 'team-member-2-role', type: 'text', tag: 'p', content: 'Partner & Strategy Lead' },
        {
          id: 'team-member-2-bio',
          type: 'text',
          tag: 'p',
          content:
            'Anika brings fifteen years of brand strategy experience from Wolff Olins and Interbrand. She leads discovery workshops, positioning work, and ensures every visual decision traces back to a strategic insight.',
        },
        // Member 3
        {
          id: 'team-member-3-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&h=400&fit=crop',
          alt: 'Marcus Webb headshot',
          width: 400,
          height: 400,
        },
        { id: 'team-member-3-name', type: 'heading', tag: 'h3', content: 'Marcus Webb' },
        { id: 'team-member-3-role', type: 'text', tag: 'p', content: 'Head of Engineering' },
        {
          id: 'team-member-3-bio',
          type: 'text',
          tag: 'p',
          content:
            'Marcus leads our engineering practice, bridging design and code. Previously a staff engineer at Vercel, he ensures every site and application we ship is fast, accessible, and built on solid architecture.',
        },
        // Member 4
        {
          id: 'team-member-4-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
          alt: 'Elena Voss headshot',
          width: 400,
          height: 400,
        },
        { id: 'team-member-4-name', type: 'heading', tag: 'h3', content: 'Elena Voss' },
        { id: 'team-member-4-role', type: 'text', tag: 'p', content: 'Design Director' },
        {
          id: 'team-member-4-bio',
          type: 'text',
          tag: 'p',
          content:
            'Elena directs visual design across brand identity and digital projects. Her typographic sensibility and obsessive attention to craft have earned recognition from the Type Directors Club and Communication Arts.',
        },
        // Member 5
        {
          id: 'team-member-5-image',
          type: 'image',
          content: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
          alt: 'Ryan Ishikawa headshot',
          width: 400,
          height: 400,
        },
        { id: 'team-member-5-name', type: 'heading', tag: 'h3', content: 'Ryan Ishikawa' },
        { id: 'team-member-5-role', type: 'text', tag: 'p', content: 'Motion Design Lead' },
        {
          id: 'team-member-5-bio',
          type: 'text',
          tag: 'p',
          content:
            'Ryan leads motion and 3D across the studio. From brand animations to complex product micro-interactions, he brings static designs to life with movement that feels intentional and effortless.',
        },
      ],
    },
    {
      id: 'team-cta',
      name: 'Join Us CTA',
      type: 'cta',
      elements: [
        {
          id: 'team-cta-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Want to join us?',
        },
        {
          id: 'team-cta-text',
          type: 'text',
          tag: 'p',
          content:
            'We are always looking for talented people who care deeply about their craft. Check our open roles or send a portfolio to careers@meridianstudio.com.',
        },
        { id: 'team-cta-button', type: 'button', content: 'View Open Positions', href: '/careers' },
      ],
    },
    { ...sharedFooter, id: 'team-footer' },
  ],
};

// ─── Contact Page ────────────────────────────────────────────────────

const contactPage: PageContent = {
  pageId: 'page-contact',
  sections: [
    { ...sharedNav, id: 'contact-nav' },
    {
      id: 'contact-hero',
      name: 'Contact Header',
      type: 'hero',
      elements: [
        { id: 'contact-hero-label', type: 'text', tag: 'span', content: 'Get in Touch' },
        {
          id: 'contact-hero-heading',
          type: 'heading',
          tag: 'h1',
          content: "Let's start something great",
        },
        {
          id: 'contact-hero-text',
          type: 'text',
          tag: 'p',
          content:
            'Tell us about your project, timeline, and budget. We will get back to you within one business day with an honest assessment of how we can help.',
        },
        {
          id: 'contact-email',
          type: 'text',
          tag: 'p',
          content: 'hello@meridianstudio.com',
        },
        {
          id: 'contact-phone',
          type: 'text',
          tag: 'p',
          content: '+1 (718) 555-0192',
        },
        {
          id: 'contact-address',
          type: 'text',
          tag: 'p',
          content: '147 North 7th Street, Suite 3F, Brooklyn, NY 11249',
        },
      ],
    },
    {
      id: 'contact-form',
      name: 'Contact Form',
      type: 'contact-form',
      elements: [
        {
          id: 'contact-form-heading',
          type: 'heading',
          tag: 'h2',
          content: 'Send us a message',
        },
        {
          id: 'contact-field-name',
          type: 'form-field',
          content: 'Full Name',
          placeholder: 'Jane Smith',
        },
        {
          id: 'contact-field-email',
          type: 'form-field',
          content: 'Email Address',
          placeholder: 'jane@company.com',
        },
        {
          id: 'contact-field-company',
          type: 'form-field',
          content: 'Company',
          placeholder: 'Acme Inc.',
        },
        {
          id: 'contact-field-budget',
          type: 'form-field',
          content: 'Project Budget',
          placeholder: 'Select a range',
        },
        {
          id: 'contact-field-timeline',
          type: 'form-field',
          content: 'Timeline',
          placeholder: 'When do you need this done?',
        },
        {
          id: 'contact-field-services',
          type: 'form-field',
          content: 'Services Needed',
          placeholder: 'Brand Identity, Web Design, Product Design, Motion...',
        },
        {
          id: 'contact-field-message',
          type: 'form-field',
          content: 'Project Details',
          placeholder: 'Tell us about your project, goals, and any context that would help us understand the scope.',
        },
        {
          id: 'contact-form-submit',
          type: 'button',
          content: 'Send Message',
          href: '#',
        },
        {
          id: 'contact-form-note',
          type: 'text',
          tag: 'p',
          content: 'We respond to every inquiry. Expect a reply within one business day.',
        },
      ],
    },
    { ...sharedFooter, id: 'contact-footer' },
  ],
};

// ─── Export ──────────────────────────────────────────────────────────

export const pageContents: PageContent[] = [
  homePage,
  aboutPage,
  blogPage,
  blogPostPage,
  teamPage,
  contactPage,
];
