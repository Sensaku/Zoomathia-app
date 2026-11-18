import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Compass,
  BookOpen,
  Search,
  Highlighter,
  Database,
  HelpCircle,
  Code,
  Layers,
  Info,
  ChevronDown,
  Globe,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { AccountMenu } from '../features/accounts'

interface SubNavItem {
  to: string
  label: string
  desc: string
  icon: LucideIcon
}

interface DropdownGroup {
  id: 'texts' | 'data'
  label: string
  icon: LucideIcon
  activePaths: string[]
  items: SubNavItem[]
}

export const Navbar: React.FC = () => {
  const location = useLocation()
  const { language, setLanguage, t } = useI18n()

  const [openDropdown, setOpenDropdown] = useState<'texts' | 'data' | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fermer les menus déroulants et le menu mobile lors d'un changement d'URL
  useEffect(() => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Fermer lors d'un clic en dehors ou appui sur Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current)
      }
    }
  }, [])

  // Définition des groupes de menus déroulants
  const dropdownGroups: DropdownGroup[] = [
    {
      id: 'texts',
      label: t.nav.textsAndCorpus,
      icon: BookOpen,
      activePaths: [
        '/explore-work',
        '/explore-corpus',
        '/annotate',
        '/corpus-annotation',
        '/ExploreAWork',
        '/ExploreTheCorpus',
      ],
      items: [
        {
          to: '/explore-work',
          label: t.nav.work,
          desc: t.nav.workDesc,
          icon: BookOpen,
        },
        {
          to: '/explore-corpus',
          label: t.nav.corpus,
          desc: t.nav.corpusDesc,
          icon: Search,
        },
        {
          to: '/annotate',
          label: t.nav.annotate,
          desc: t.nav.annotateDesc,
          icon: Highlighter,
        },
      ],
    },
    {
      id: 'data',
      label: t.nav.dataAndSemantics,
      icon: Database,
      activePaths: ['/competency-questions', '/sparql', '/thesaurus-proposals', '/CompetencyQuestion'],
      items: [
        {
          to: '/competency-questions',
          label: t.nav.cqs,
          desc: t.nav.cqsDesc,
          icon: HelpCircle,
        },
        {
          to: '/sparql',
          label: t.nav.sparql,
          desc: t.nav.sparqlDesc,
          icon: Code,
        },
        {
          to: '/thesaurus-proposals',
          label: t.nav.thesaurus,
          desc: t.nav.thesaurusDesc,
          icon: Layers,
        },
      ],
    },
  ]

  const handleMouseEnter = (id: 'texts' | 'data') => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current)
    }
    setOpenDropdown(id)
  }

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null)
    }, 150)
  }

  const toggleDropdown = (id: 'texts' | 'data') => {
    setOpenDropdown((current) => (current === id ? null : id))
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#3d3730] bg-[#1f1d1a] text-[#f4efe6] shadow-md">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between" ref={navRef}>
          {/* Logo et Identité Zoomathia */}
          <Link to="/" className="group flex flex-shrink-0 items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-[#9A6530] font-serif text-xl font-bold text-white shadow-inner">
              Z
            </div>
            <div>
              <span className="font-serif text-xl font-semibold tracking-wider text-white transition-colors group-hover:text-[#ddccae]">
                ZOOMATHIA
              </span>
              <span className="-mt-1 block text-xs tracking-widest text-[#a39a8c] uppercase">
                {t.nav.brandSubtitle}
              </span>
            </div>
          </Link>

          {/* Navigation Bureau */}
          <div className="hidden items-center space-x-2 md:flex lg:space-x-3">
            <nav className="flex items-center space-x-1 lg:space-x-2">
              {/* 1. Accueil (Lien direct) */}
              <Link
                to="/"
                className={`flex items-center space-x-1.5 rounded-none px-3 py-2 text-sm font-medium transition-all ${
                  location.pathname === '/'
                    ? 'bg-[#9A6530] text-white shadow'
                    : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                }`}
              >
                <Compass className="h-4 w-4" />
                <span>{t.nav.home}</span>
              </Link>

              {/* 2 & 3. Groupes déroulants */}
              {dropdownGroups.map((group) => {
                const isGroupActive = group.activePaths.includes(location.pathname)
                const isOpen = openDropdown === group.id
                const GroupIcon = group.icon

                return (
                  <div
                    key={group.id}
                    className="relative"
                    onMouseEnter={() => handleMouseEnter(group.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDropdown(group.id)}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      className={`flex cursor-pointer items-center space-x-1.5 rounded-none px-3 py-2 text-sm font-medium transition-all ${
                        isGroupActive
                          ? 'bg-[#9A6530] text-white shadow'
                          : isOpen
                            ? 'bg-[#2e2a24] text-white'
                            : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                      }`}
                    >
                      <GroupIcon className="h-4 w-4" />
                      <span>{group.label}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 opacity-75 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Panneau déroulant flottant */}
                    {isOpen && (
                      <div className="animate-in fade-in zoom-in-95 absolute top-full left-0 z-50 w-80 pt-1.5 duration-150">
                        <div className="rounded-none border border-[#443b32] bg-[#25211c] p-2 shadow-2xl">
                          <div className="flex flex-col space-y-1">
                            {group.items.map((item) => {
                              const isItemActive = location.pathname === item.to
                              const ItemIcon = item.icon
                              return (
                                <Link
                                  key={item.to}
                                  to={item.to}
                                  className={`group flex items-start space-x-3 rounded-none p-2.5 transition-all ${
                                    isItemActive
                                      ? 'border-l-2 border-[#9A6530] bg-[#383129] text-white'
                                      : 'text-[#d6cec0] hover:bg-[#302a23] hover:text-white'
                                  }`}
                                >
                                  <div
                                    className={`mt-0.5 rounded-none p-2 transition-colors ${
                                      isItemActive
                                        ? 'bg-[#9A6530] text-white'
                                        : 'bg-[#1e1c19] text-[#b3a899] group-hover:bg-[#9A6530] group-hover:text-white'
                                    }`}
                                  >
                                    <ItemIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm leading-snug font-medium">{item.label}</div>
                                    <div className="mt-0.5 line-clamp-2 text-xs leading-tight text-[#a39a8c]">
                                      {item.desc}
                                    </div>
                                  </div>
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 4. À propos (Lien direct) */}
              <Link
                to="/about"
                className={`flex items-center space-x-1.5 rounded-none px-3 py-2 text-sm font-medium transition-all ${
                  location.pathname === '/about'
                    ? 'bg-[#9A6530] text-white shadow'
                    : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                }`}
              >
                <Info className="h-4 w-4" />
                <span>{t.nav.about}</span>
              </Link>
            </nav>

            {/* Sélecteur de langue bilingue FR / EN */}
            <div className="ml-2 flex items-center rounded-none border border-[#453e37] bg-[#2c2723] p-1">
              <Globe className="mr-1 ml-1.5 h-3.5 w-3.5 text-[#a89e90]" />
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                className={`cursor-pointer rounded-none px-2 py-1 text-xs font-semibold tracking-wider transition-all ${
                  language === 'fr' ? 'bg-[#9A6530] text-white shadow-xs' : 'text-[#a89e90] hover:text-white'
                }`}
                title="Passer en français"
              >
                FR
              </button>
              <span className="px-0.5 text-xs text-[#595045]">|</span>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`cursor-pointer rounded-none px-2 py-1 text-xs font-semibold tracking-wider transition-all ${
                  language === 'en' ? 'bg-[#9A6530] text-white shadow-xs' : 'text-[#a89e90] hover:text-white'
                }`}
                title="Switch to English"
              >
                EN
              </button>
            </div>

            <AccountMenu />
          </div>

          {/* Boutons Mobile : Langue + Hamburger */}
          <div className="flex items-center space-x-2 md:hidden">
            <div className="flex items-center rounded-none border border-[#453e37] bg-[#2c2723] p-1">
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                className={`rounded-none px-2 py-1 text-xs font-semibold ${
                  language === 'fr' ? 'bg-[#9A6530] text-white' : 'text-[#a89e90]'
                }`}
              >
                FR
              </button>
              <span className="px-0.5 text-xs text-[#595045]">|</span>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-none px-2 py-1 text-xs font-semibold ${
                  language === 'en' ? 'bg-[#9A6530] text-white' : 'text-[#a89e90]'
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle mobile menu"
              className="rounded-none border border-[#453e37] bg-[#2c2723] p-2 text-[#d6cec0] transition-colors hover:bg-[#3d3730] hover:text-white"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Mobile Dépliant */}
      {mobileMenuOpen && (
        <div className="max-h-[calc(100vh-4rem)] space-y-4 overflow-y-auto border-t border-[#3d3730] bg-[#221f1b] px-4 py-4 shadow-xl md:hidden">
          {/* Accueil mobile */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center space-x-2.5 rounded-none px-3 py-2.5 text-sm font-medium ${
              location.pathname === '/' ? 'bg-[#9A6530] text-white' : 'text-[#d6cec0] hover:bg-[#2c2723]'
            }`}
          >
            <Compass className="h-4 w-4 text-[#d6cec0]" />
            <span>{t.nav.home}</span>
          </Link>

          {/* Groupes mobile */}
          {dropdownGroups.map((group) => {
            const isGroupActive = group.activePaths.includes(location.pathname)
            const GroupIcon = group.icon
            return (
              <div key={group.id} className="space-y-1 border-t border-[#332c25] pt-1">
                <div className="flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold tracking-wider text-[#a39a8c] uppercase">
                  <GroupIcon className="h-3.5 w-3.5 text-[#9A6530]" />
                  <span>{group.label}</span>
                </div>
                <div className="space-y-1 pl-2">
                  {group.items.map((item) => {
                    const isItemActive = location.pathname === item.to
                    const ItemIcon = item.icon
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-start space-x-3 rounded-none px-3 py-2 text-sm transition-colors ${
                          isItemActive
                            ? 'border-l-2 border-[#9A6530] bg-[#383129] text-white'
                            : 'text-[#d6cec0] hover:bg-[#2c2723]'
                        }`}
                      >
                        <ItemIcon className="mt-0.5 h-4 w-4 text-[#a89e90]" />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-[#a39a8c]">{item.desc}</div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* À propos mobile */}
          <div className="border-t border-[#332c25] pt-1">
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-2.5 rounded-none px-3 py-2.5 text-sm font-medium ${
                location.pathname === '/about' ? 'bg-[#9A6530] text-white' : 'text-[#d6cec0] hover:bg-[#2c2723]'
              }`}
            >
              <Info className="h-4 w-4 text-[#d6cec0]" />
              <span>{t.nav.about}</span>
            </Link>
          </div>

          <div className="border-t border-chrome-line pt-1">
            <AccountMenu variant="mobile" onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
    </header>
  )
}
