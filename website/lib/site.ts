export const SITE = {

  name: 'Abroadster',

  tagline: 'Study abroad, together',

  /** Used only server-side for contact routing. Never render on pages. */

  supportEmail: 'samimoudarres@hotmail.com',

  appStoreUrl: 'https://apps.apple.com/app/id6800081262',

  /** App Store Connect Support URL — must be a working HTML support page. */

  supportUrl: 'https://abroadster.vercel.app/support',

  privacyUrl: 'https://abroadster.vercel.app/privacy',

  termsUrl: 'https://abroadster.vercel.app/terms',

  deleteAccountUrl: 'https://abroadster.vercel.app/delete-account',

} as const;



/** Feature beats with simple, human copy (no em dashes). */

export const FEATURES = [

  {

    slug: 'map',

    stamp: 'The map',

    title: 'See who’s in your city',

    blurb:

      'Friends, classmates, and study programs show up on the map. If they share live location, you see the city they’re in now. If not, you see their study-abroad city.',

    image: '/phones/map.png',

    alt: 'Abroadster map of Paris with friend pins and study programs',

  },

  {

    slug: 'trips',

    stamp: 'Trips',

    title: 'Plan the weekend for real',

    blurb:

      'Make a trip, invite people, and follow the album. When a friend opens a trip to Paris, you can tap Request to Join instead of losing the plan in a group chat.',

    image: '/phones/trips.png',

    alt: 'Abroadster Trips tab with Follow Album and Request to Join',

  },

  {

    slug: 'album',

    stamp: 'Albums',

    title: 'One album for the whole trip',

    blurb:

      'Everyone on the trip can add photos in one place. Dates, who’s going, trip chat, and the album all live together.',

    image: '/phones/album.png',

    alt: 'Abroadster trip album for Mykonos with travelers and photos',

  },

  {

    slug: 'chat',

    stamp: 'Chats',

    title: 'School chats with trips inside',

    blurb:

      'Talk in your school community, get dinner ideas, and join trips right from the chat when someone posts one.',

    image: '/phones/chat.png',

    alt: 'Abroadster community chat with a Paris trip invite card',

  },

  {

    slug: 'feed',

    stamp: 'Stamps',

    title: 'Stamp posts from friends abroad',

    blurb:

      'When friends share from Paris or Venice, you can stamp their post. It’s a simple way to react without turning everything into noise.',

    image: '/phones/feed.png',

    alt: 'Abroadster home feed with stamped travel collage from Paris',

  },

  {

    slug: 'profile',

    stamp: 'Profile',

    title: 'Your semester in one place',

    blurb:

      'Posts, cities, school tags, and photo grids on your profile. A simple scrapbook of where you’ve been.',

    image: '/phones/profile.png',

    alt: 'Abroadster profile scrapbook with university tags and photo grid',

  },

] as const;


