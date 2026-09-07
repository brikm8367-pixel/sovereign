export type Language = 'ar' | 'en' | 'fr' | 'es' | 'de' | 'tr' | 'pt';

export interface Translations {
  header: {
    features: string;
    howItWorks: string;
    categories: string;
    login: string;
    getStarted: string;
  };
  hero: {
    badge: string;
    title1: string;
    title2: string;
    subtitle: string;
    cta1: string;
    cta2: string;
    trust1: string;
    trust2: string;
    trust3: string;
  };
  categories: {
    title1: string;
    title2: string;
    subtitle: string;
    work: {
      title: string;
      description: string;
    };
    audience: {
      title: string;
      description: string;
    };
    others: {
      title: string;
      description: string;
    };
  };
  features: {
    title1: string;
    title2: string;
    subtitle: string;
    feature1: {
      title: string;
      description: string;
    };
    feature2: {
      title: string;
      description: string;
    };
    feature3: {
      title: string;
      description: string;
    };
    feature4: {
      title: string;
      description: string;
    };
    notification: {
      title: string;
      subtitle: string;
    };
  };
  howItWorks: {
    title1: string;
    title2: string;
    subtitle: string;
    step1: {
      title: string;
      description: string;
    };
    step2: {
      title: string;
      description: string;
    };
    step3: {
      title: string;
      description: string;
    };
  };
  cta: {
    badge: string;
    title: string;
    subtitle: string;
    button1: string;
    button2: string;
  };
  footer: {
    description: string;
    quickLinks: string;
    home: string;
    features: string;
    howItWorks: string;
    pricing: string;
    contactUs: string;
    copyright: string;
  };
  demoModal: {
    persona: {
      name: string;
      role: string;
      followers: string;
      quote: string;
    };
    categories: {
      work: {
        title: string;
        messages: {
          sender1: string;
          preview1: string;
          sender2: string;
          preview2: string;
          sender3: string;
          preview3: string;
        };
        count: string;
      };
      audience: {
        title: string;
        messages: {
          sender1: string;
          preview1: string;
          sender2: string;
          preview2: string;
          sender3: string;
          preview3: string;
        };
        count: string;
      };
      closeOnes: {
        title: string;
        messages: {
          sender1: string;
          preview1: string;
          sender2: string;
          preview2: string;
          sender3: string;
          preview3: string;
        };
        count: string;
      };
    };
    stats: {
      todayMessages: string;
      importantMessages: string;
      timeSaved: string;
      timeSavedValue: string;
    };
    organizedInbox: string;
    ofMessages: string;
    footer: string;
    tryNow: string;
    timeAgo: {
      minutes: string;
      hour: string;
      hours: string;
    };
  };
  auth: {
    login: string;
    signup: string;
    email: string;
    password: string;
    username: string;
    displayName: string;
    loginButton: string;
    signupButton: string;
    noAccount: string;
    hasAccount: string;
    forgotPassword: string;
    or: string;
    errors: {
      invalidEmail: string;
      weakPassword: string;
      userExists: string;
      invalidCredentials: string;
      generic: string;
    };
  };
  search: {
    placeholder: string;
    noResults: string;
    searching: string;
  };
  compose: {
    newOffer: string;
    offerDetails: string;
    fillDetails: string;
    companyName: string;
    companyNamePlaceholder: string;
    websiteUrl: string;
    websiteUrlPlaceholder: string;
    budget: string;
    budgetCycle: string;
    perPost: string;
    perCampaign: string;
    dealType: string;
    campaignDescription: string;
    campaignDescriptionPlaceholder: string;
    deliverables: string;
    deliverablesPlaceholder: string;
    timeline: string;
    exclusivity: string;
    exclusive: string;
    nonExclusive: string;
    whyThem: string;
    whyThemPlaceholder: string;
    sendOffer: string;
    sending: string;
    back: string;
    budgets: {
      under5k: { label: string; description: string };
      '5k-10k': { label: string; description: string };
      '10k-50k': { label: string; description: string };
      over50k: { label: string; description: string };
    };
    dealTypes: {
      instagramPost: { label: string; description: string };
      instagramStory: { label: string; description: string };
      instagramReel: { label: string; description: string };
      tiktokVideo: { label: string; description: string };
      youtubeVideo: { label: string; description: string };
      other: { label: string; description: string };
    };
    timelines: {
      asap: { label: string; description: string };
      within1Month: { label: string; description: string };
      within3Months: { label: string; description: string };
      flexible: { label: string; description: string };
    };
    otherDealTypeLabel: string;
    otherBudgetCycleLabel: string;
    currency: string;
    currencies: {
      USD: string;
      EUR: string;
      GBP: string;
      AED: string;
      SAR: string;
      KWD: string;
    };
    validation: {
      required: string;
      invalidUrl: string;
    };
  };
  dashboard: {
    agentDashboard: string;
    home: string;
    pendingOffers: string;
    noPendingOffers: string;
    selectTalent: string;
    myOffers: string;
    noOffersYet: string;
    conversations: string;
    loading: string;
    accept: string;
    reject: string;
    askTalent: string;
    questionForTalent: string;
    dealDetails: string;
    writeQuestion: string;
    sendQuestion: string;
    sending: string;
    close: string;
    status: {
      accepted: string;
      declined: string;
      pending: string;
      openChat: string;
    };
    openChat: string;
    questionSent: string;
    questionFailed: string;
    offerAccepted: string;
    offerRejected: string;
    acceptFailed: string;
    rejectFailed: string;
    authorizedAgent: string;
    represents: string;
    voiceMessage: string;
    send: string;
    attachMedia: string;
    typeMessage: string;
    recordingUnavailable: string;
    edited: string;
    today: string;
    yesterday: string;
    noMessages: string;
    startConversation: string;
    regardingDeal: string;
    error: string;
  };
  settings: {
    language: string;
    selectLanguage: string;
    theme: string;
    darkMode: string;
    lightMode: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    confirm: string;
    back: string;
    next: string;
    done: string;
    loading: string;
    error: string;
    success: string;
    optional: string;
    required: string;
  };
}
