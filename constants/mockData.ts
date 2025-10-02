// Mock data for development and testing
export const MOCK_NEWSLETTER_DATA = {
  topics: [
    {
      topic: "International Affairs",
      slug: "international",
      publisher: "BBC",
      sectionHints: ["international"],
      items: [
        {
          title:
            "Ukrainian diver held in Poland over Russian pipeline blasts in Baltic Sea",
          link: "https://www.bbc.com/news/articles/cy4dmpkn824o",
          description:
            "A Ukrainian diver has been detained in Poland, with authorities linking him to the 2022 Russian pipeline blasts in the Baltic Sea.",
          pubDate: new Date("2025-10-01T00:25:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "International Affairs",
          slug: "international",
          sectionHints: ["international"],
        },
        {
          title:
            "Magnitude 6.9 earthquake strikes Eastern Visayas region, Philippines; no tsunami warning",
          link: "https://www.channelnewsasia.com/asia/philippines-earthquake-magnitude-6-9-eastern-visayas-4632154",
          description:
            "A magnitude 6.9 earthquake has struck the Eastern Visayas region of the Philippines, though no tsunami warning has been issued.",
          pubDate: new Date("2025-09-30T23:14:00Z").toISOString(),
          source: "cna-rss",
          publisher: "ChannelNewsAsia",
          topic: "International Affairs",
          slug: "international",
          sectionHints: ["international"],
        },
        {
          title:
            "Madagascar police fire tear gas as president fails to placate protesters",
          link: "https://www.bbc.com/news/articles/czd7qp7jg5ko",
          description:
            "Madagascar police have used tear gas to disperse protesters as the president struggles to quell deadly demonstrations that have resulted in at least 22 deaths.",
          pubDate: new Date("2025-09-30T23:13:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "International Affairs",
          slug: "international",
          sectionHints: ["international"],
        },
      ],
    },
    {
      topic: "US Politics",
      slug: "politics",
      publisher: "NPR",
      sectionHints: ["politics"],
      items: [
        {
          title:
            "Why the US government might shut down and when it might happen",
          link: "https://www.bbc.com/news/articles/cze3d4lyd8mo",
          description:
            "The US government faces a potential shutdown as Republicans and Democrats struggle to agree on a spending bill.",
          pubDate: new Date("2025-10-01T00:11:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "US Politics",
          slug: "politics",
          sectionHints: ["politics"],
        },
        {
          title:
            "With 'drug boat' strikes, Trump leans into war on terror tactic against cartels",
          link: "https://www.npr.org/2025/10/01/nx-s1-5134567/trump-drug-boat-strikes-cartels",
          description:
            'The Trump administration is employing "drug boat" strikes, a tactic reminiscent of the global war on terror, to combat drug cartels.',
          pubDate: new Date("2025-10-01T00:06:00Z").toISOString(),
          source: "npr-rss",
          publisher: "NPR",
          topic: "US Politics",
          slug: "politics",
          sectionHints: ["politics"],
        },
        {
          title:
            "Poll: Republicans get more of the blame than Democrats for a potential shutdown",
          link: "https://www.npr.org/2025/10/01/nx-s1-5134234/poll-republicans-democrats-blame-shutdown",
          description:
            "A new poll indicates that Republicans are receiving more blame than Democrats for a potential US government shutdown.",
          pubDate: new Date("2025-10-01T00:00:00Z").toISOString(),
          source: "npr-rss",
          publisher: "NPR",
          topic: "US Politics",
          slug: "politics",
          sectionHints: ["politics"],
        },
        {
          title:
            "Trump sets deadline for Hamas to respond to his Gaza peace plan",
          link: "https://www.aljazeera.com/news/2025/9/30/trump-sets-deadline-for-hamas-to-respond-to-his-gaza-peace-plan",
          description:
            "President Trump has set a deadline for Hamas to respond to his proposed plan to end the war in Gaza.",
          pubDate: new Date("2025-09-30T23:47:00Z").toISOString(),
          source: "aljazeera-rss",
          publisher: "Al Jazeera",
          topic: "US Politics",
          slug: "politics",
          sectionHints: ["politics"],
        },
      ],
    },
    {
      topic: "Business & Technology",
      slug: "business-tech",
      publisher: "BBC",
      sectionHints: ["business", "tech"],
      items: [
        {
          title:
            "Israeli high-tech funding and M&A gain in 2025 despite ongoing Gaza war",
          link: "https://www.channelnewsasia.com/business/israel-high-tech-funding-ma-gain-2025-gaza-war-4632123",
          description:
            "Israeli high-tech funding and M&A activity have seen an increase in 2025, even amidst the ongoing conflict in Gaza.",
          pubDate: new Date("2025-10-01T00:03:00Z").toISOString(),
          source: "cna-rss",
          publisher: "ChannelNewsAsia",
          topic: "Business & Technology",
          slug: "business-tech",
          sectionHints: ["tech"],
        },
        {
          title: "When is the Budget and what might be in it?",
          link: "https://www.bbc.com/news/articles/cx2gd7yj8pgo",
          description:
            "Chancellor Rachel Reeves is set to unveil her economic plans in the upcoming Budget on November 26th.",
          pubDate: new Date("2025-09-30T23:42:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "Business & Technology",
          slug: "business-tech",
          sectionHints: ["business"],
        },
        {
          title:
            "Start-up founder Charlie Javice sentenced for defrauding JPMorgan",
          link: "https://www.bbc.com/news/articles/cj4dp8yzv9lo",
          description:
            "Start-up founder Charlie Javice has been sentenced to over seven years in prison for defrauding JPMorgan Chase.",
          pubDate: new Date("2025-09-30T23:14:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "Business & Technology",
          slug: "business-tech",
          sectionHints: ["business"],
        },
      ],
    },
    {
      topic: "Commentary & Opinion",
      slug: "commentaries",
      publisher: "The Guardian",
      sectionHints: ["commentaries"],
      items: [
        {
          title:
            "Labour won't fend off Reform UK by just diluting Farage's poison | Letters",
          link: "https://www.theguardian.com/politics/2025/oct/01/labour-wont-fend-off-reform-uk-by-just-diluting-farages-poison",
          description:
            "A call for Labour to offer a truthful stance on immigration rather than adopting diluted policies from Reform UK.",
          pubDate: new Date("2025-10-01T00:18:00Z").toISOString(),
          source: "guardian-rss",
          publisher: "The Guardian",
          topic: "Commentary & Opinion",
          slug: "commentaries",
          sectionHints: ["commentaries"],
        },
        {
          title: "When shopping delivers a moral dilemma | Letters",
          link: "https://www.theguardian.com/money/2025/oct/01/when-shopping-delivers-a-moral-dilemma",
          description:
            "Readers debate the ethical implications of receiving unsolicited goods from online retailers.",
          pubDate: new Date("2025-10-01T00:18:00Z").toISOString(),
          source: "guardian-rss",
          publisher: "The Guardian",
          topic: "Commentary & Opinion",
          slug: "commentaries",
          sectionHints: ["commentaries"],
        },
        {
          title:
            "NHS 10-year plan will embed privatisation and hollow out the health service | Letter",
          link: "https://www.theguardian.com/society/2025/oct/01/nhs-10-year-plan-will-embed-privatisation-and-hollow-out-the-health-service",
          description:
            "Concerns are raised that a 10-year NHS plan could embed privatization and weaken the health service.",
          pubDate: new Date("2025-10-01T00:18:00Z").toISOString(),
          source: "guardian-rss",
          publisher: "The Guardian",
          topic: "Commentary & Opinion",
          slug: "commentaries",
          sectionHints: ["commentaries"],
        },
        {
          title:
            "It's the art of the dodgy deal, Middle East edition: author Donald Trump, updated by Jared Kushner | Marina Hyde",
          link: "https://www.theguardian.com/commentisfree/2025/sep/30/donald-trump-jared-kushner-middle-east-deals",
          description:
            "A satirical take on Donald Trump and Jared Kushner's negotiation tactics in the Middle East.",
          pubDate: new Date("2025-09-30T21:44:00Z").toISOString(),
          source: "guardian-rss",
          publisher: "The Guardian",
          topic: "Commentary & Opinion",
          slug: "commentaries",
          sectionHints: ["commentaries"],
        },
        {
          title:
            "While world leaders dither over a Gaza peace plan, I'm sailing with supplies, hoping to break Israel's blockade | Naoise Dolan",
          link: "https://www.theguardian.com/commentisfree/2025/sep/30/gaza-peace-plan-sailing-supplies-israel-blockade",
          description:
            "A personal account of a journey to Gaza, highlighting solidarity and the hope of breaking the blockade.",
          pubDate: new Date("2025-09-30T20:55:00Z").toISOString(),
          source: "guardian-rss",
          publisher: "The Guardian",
          topic: "Commentary & Opinion",
          slug: "commentaries",
          sectionHints: ["commentaries"],
        },
      ],
    },
    {
      topic: "Science & Health",
      slug: "science",
      publisher: "BBC",
      sectionHints: ["culture"],
      items: [
        {
          title: "Scientists make embryos from human skin DNA for first time",
          link: "https://www.bbc.com/news/articles/cz9xp4yj8nmo",
          description:
            "Scientists have successfully created human embryos from skin cell DNA for the first time, offering new possibilities for treating infertility.",
          pubDate: new Date("2025-09-30T23:01:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "Science & Health",
          slug: "science",
          sectionHints: ["culture"],
        },
      ],
    },
    {
      topic: "Sports & Culture",
      slug: "wildcard",
      publisher: "BBC",
      sectionHints: ["sport"],
      items: [
        {
          title: "The NFL tactics influencing the Premier League",
          link: "https://www.bbc.com/sport/football/articles/cwy4dp8yz9ko",
          description:
            "The NFL's strategic blocking tactics at set-pieces are now influencing Premier League football teams.",
          pubDate: new Date("2025-10-01T00:09:00Z").toISOString(),
          source: "bbc-rss",
          publisher: "BBC",
          topic: "Sports & Culture",
          slug: "wildcard",
          sectionHints: ["sport"],
        },
      ],
    },
  ],
} as const;
