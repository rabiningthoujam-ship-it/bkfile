import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  adminStats,
  categories,
  highlights,
  marketplaceReviews,
  matchmakingProfiles,
  metrics,
  services as mockServices,
  testimonials,
  weddingProducts,
} from "./data/mockData";
import {
  createInquiry,
  createOrder,
  fetchChatMessages,
  fetchCurrentUserRole,
  fetchOrders,
  fetchProducts,
  fetchProfiles,
  fetchServices,
  fetchVendors,
  getCurrentSession,
  insertProfile,
  insertProduct,
  insertService,
  insertVendor,
  sendChatMessage,
  signInUser,
  signOutUser,
  signUpUser,
  subscribeToRoom,
  supabase,
  supabaseEnabled,
} from "./lib/supabase";
import { getAdminUrl, getHostHints, getPublicUrl, isAdminHostname } from "./lib/siteConfig";

const initialCheckoutForm = {
  customerName: "",
  customerEmail: "",
  phone: "",
  eventDate: "",
  note: "",
};

function App() {
  const location = useLocation();
  const [profiles, setProfiles] = useState(matchmakingProfiles);
  const [products, setProducts] = useState(weddingProducts);
  const [services, setServices] = useState(mockServices);
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [plannerItems, setPlannerItems] = useState([]);
  const [shortlistedIds, setShortlistedIds] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [userRole, setUserRole] = useState("guest");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [bannerMessage, setBannerMessage] = useState(
    "Borkeina is ready to manage matchmaking, boutique commerce, vendor bookings, and premium wedding journeys.",
  );

  useEffect(() => {
    let mounted = true;

    async function loadMarketplaceData() {
      if (!supabaseEnabled) {
        return;
      }

      setIsLoadingData(true);

      try {
        const [profileRows, productRows, serviceRows, vendorRows] = await Promise.all([
          fetchProfiles(),
          fetchProducts(),
          fetchServices(),
          fetchVendors(),
        ]);

        if (!mounted) {
          return;
        }

        if (profileRows.length > 0) {
          setProfiles(profileRows.map(mapProfileRecord));
        }

        if (productRows.length > 0) {
          setProducts(productRows.map(mapProductRecord));
        }

        if (serviceRows.length > 0) {
          setServices(serviceRows.map(mapServiceRecord));
        }

        if (vendorRows.length > 0) {
          setVendors(vendorRows.map(mapVendorRecord));
        }

      } catch (error) {
        if (mounted) {
          setBannerMessage(error.message || "Could not load Supabase data, using demo content.");
        }
      } finally {
        if (mounted) {
          setIsLoadingData(false);
        }
      }
    }

    loadMarketplaceData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function syncSession() {
      if (!supabaseEnabled || !supabase) {
        return;
      }

      const currentSession = await getCurrentSession();
      const currentRole = currentSession?.user ? await fetchCurrentUserRole() : "guest";

      if (!mounted) {
        return;
      }

      setAuthUser(currentSession?.user ?? null);
      setUserRole(currentRole);
    }

    syncSession();

    if (!supabaseEnabled || !supabase) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }

      setAuthUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        fetchCurrentUserRole()
          .then((role) => {
            if (mounted) {
              setUserRole(role);
            }
          })
          .catch(() => {
            if (mounted) {
              setUserRole("member");
            }
          });
      } else {
        setUserRole("guest");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadOrdersForRole() {
      if (!supabaseEnabled || userRole !== "admin") {
        if (mounted) {
          setOrders([]);
        }
        return;
      }

      try {
        const orderRows = await fetchOrders();

        if (mounted) {
          setOrders(orderRows.map(mapOrderRecord));
        }
      } catch (error) {
        if (mounted) {
          setBannerMessage(error.message || "Could not load orders for admin view.");
        }
      }
    }

    loadOrdersForRole();

    return () => {
      mounted = false;
    };
  }, [userRole]);

  function pushBanner(message) {
    setBannerMessage(message);
  }

  function addPlannerItem(item) {
    setPlannerItems((current) => {
      const exists = current.some(
        (entry) => entry.kind === item.kind && String(entry.id) === String(item.id),
      );

      if (exists) {
        return current;
      }

      return [...current, item];
    });

    pushBanner(`${item.title} added to cart/planner.`);
  }

  function removePlannerItem(itemKey) {
    setPlannerItems((current) => current.filter((item) => item.key !== itemKey));
  }

  function toggleShortlist(profileId) {
    setShortlistedIds((current) => {
      const exists = current.includes(profileId);
      return exists ? current.filter((id) => id !== profileId) : [...current, profileId];
    });
  }

  async function requestProfileAccess(profile) {
    if (supabaseEnabled) {
      await createInquiry({
        customer_name: authUser?.user_metadata?.full_name || "Guest member",
        customer_email: authUser?.email || "guest@example.com",
        target_type: "profile_access",
        target_id: null,
        message: `Request access for ${profile.name} from ${profile.city}.`,
        status: "new",
      });
    }

    pushBanner(
      supabaseEnabled
        ? `Access request sent for ${profile.name}.`
        : `Demo access request prepared for ${profile.name}.`,
    );
  }

  async function handleAuthSubmit(formState, mode) {
    if (!supabaseEnabled) {
      const demoUser = {
        id: "demo-user",
        email: formState.email,
        user_metadata: {
          full_name: formState.fullName || "Demo Member",
        },
      };

      setAuthUser(demoUser);
      setUserRole("member");
      pushBanner(
        mode === "signup"
          ? "Demo sign up complete. Add Supabase policies to go live."
          : "Demo sign in complete. Add Supabase policies to go live.",
      );
      return;
    }

    if (mode === "signup") {
      const data = await signUpUser(formState.email, formState.password, {
        full_name: formState.fullName,
      });

      pushBanner(
        data.user?.identities?.length
          ? "Account created. Confirm the email to continue."
          : "Sign up completed successfully.",
      );
      return;
    }

    const data = await signInUser(formState.email, formState.password);
    setAuthUser(data.user);
    setUserRole(await fetchCurrentUserRole());
    pushBanner("Signed in successfully.");
  }

  async function handleSignOut() {
    if (supabaseEnabled) {
      await signOutUser();
    }

    setAuthUser(null);
    setUserRole("guest");
    pushBanner("You have been signed out.");
  }

  async function handleProfileCreate(payload) {
    if (supabaseEnabled) {
      const created = await insertProfile(payload);
      setProfiles((current) => [mapProfileRecord(created), ...current]);
      pushBanner("Matrimonial profile published to Supabase.");
      return;
    }

    setProfiles((current) => [
      {
        id: Date.now(),
        name: payload.fullName,
        age: payload.age,
        city: payload.city,
        profession: payload.profession,
        education: payload.education,
        community: payload.community,
        preferences: splitPreferences(payload.preferences),
        privacy: payload.contactVisibility || "Request access",
      },
      ...current,
    ]);
    pushBanner("Profile added in demo mode.");
  }

  async function handleVendorCreate(payload) {
    if (supabaseEnabled) {
      const created = await insertVendor(payload);
      setVendors((current) => [mapVendorRecord(created), ...current]);
      pushBanner("Vendor published to Supabase.");
      return;
    }

    setVendors((current) => [
      {
        id: Date.now(),
        businessName: payload.businessName,
        vendorType: payload.vendorType,
        location: payload.location,
        email: payload.email,
        phone: payload.phone,
        rating: payload.rating || "0",
      },
      ...current,
    ]);
    pushBanner("Vendor added in demo mode.");
  }

  async function handleProductCreate(payload) {
    if (supabaseEnabled) {
      const created = await insertProduct(payload);
      setProducts((current) => [mapProductRecord(created), ...current]);
      pushBanner("Product published to Supabase.");
      return;
    }

    setProducts((current) => [
      {
        id: Date.now(),
        name: payload.name,
        category: payload.category,
        price: formatRupees(payload.price),
        vendor: payload.vendorName || "Admin vendor",
        description: payload.description,
      },
      ...current,
    ]);
    pushBanner("Product added in demo mode.");
  }

  async function handleServiceCreate(payload) {
    if (supabaseEnabled) {
      const created = await insertService(payload);
      setServices((current) => [mapServiceRecord(created), ...current]);
      pushBanner("Service listing published to Supabase.");
      return;
    }

    setServices((current) => [
      {
        id: Date.now(),
        name: payload.name,
        type: payload.serviceType,
        price: payload.basePrice ? `Starts ${formatRupees(payload.basePrice)}` : "Custom quote",
        location: payload.location || "Remote",
        rating: "New",
        description: payload.description,
      },
      ...current,
    ]);
    pushBanner("Service added in demo mode.");
  }

  async function handleCheckoutSubmit(formState) {
    const totalAmount = plannerItems.length * 2500;

    if (plannerItems.length === 0) {
      throw new Error("Add at least one match, product, or service before checkout.");
    }

    if (supabaseEnabled) {
      const createdOrder = await createOrder({
        customer_name: formState.customerName,
        customer_email: formState.customerEmail,
        phone: formState.phone,
        event_date: formState.eventDate || null,
        notes: formState.note || null,
        total_amount: totalAmount,
        order_status: "pending",
      });

      setOrders((current) => [mapOrderRecord(createdOrder), ...current]);

      await Promise.all(
        plannerItems.map((item) =>
          createInquiry({
            customer_name: formState.customerName,
            customer_email: formState.customerEmail,
            phone: formState.phone,
            event_date: formState.eventDate || null,
            target_type: item.kind,
            target_id: null,
            message: buildInquiryMessage(item, formState),
            status: "new",
          }),
        ),
      );
    } else {
      setOrders((current) => [
        {
          id: Date.now(),
          customerName: formState.customerName,
          amount: formatRupees(totalAmount),
          status: "pending",
        },
        ...current,
      ]);
    }

    setPlannerItems([]);
    pushBanner(
      supabaseEnabled
        ? "Checkout captured and all inquiries were saved to Supabase."
        : "Planner submitted in demo mode. Connect Supabase policies to persist orders and inquiries.",
    );
  }

  const navAuthLabel = authUser ? `Account (${userRole})` : "Login";
  const adminHostMode = isAdminHostname();
  const adminPath = adminHostMode || location.pathname.startsWith("/admin");
  const hostHints = getHostHints();

  const publicRoutes = (
    <Routes>
        <Route
          path="/"
          element={
            <HomePage
              metrics={metrics}
              highlights={highlights}
              categories={categories}
              profiles={profiles}
              services={services}
              testimonials={testimonials}
              addPlannerItem={addPlannerItem}
              shortlistedIds={shortlistedIds}
            />
          }
        />
        <Route
          path="/matches"
          element={
            <MatchesPage
              authUser={authUser}
              profiles={profiles}
              addPlannerItem={addPlannerItem}
              shortlistedIds={shortlistedIds}
              onToggleShortlist={toggleShortlist}
              onRequestAccess={requestProfileAccess}
            />
          }
        />
        <Route
          path="/shop"
          element={
            <ShopPage
              products={products}
              addPlannerItem={addPlannerItem}
              reviews={marketplaceReviews}
            />
          }
        />
        <Route
          path="/services"
          element={
            <ServicesPage
              services={services}
              addPlannerItem={addPlannerItem}
              reviews={marketplaceReviews}
            />
          }
        />
        <Route
          path="/chat"
          element={<ChatPage authUser={authUser} pushBanner={pushBanner} />}
        />
        <Route
          path="/auth"
          element={
            <AuthPage
              authUser={authUser}
              onAuthSubmit={handleAuthSubmit}
              onSignOut={handleSignOut}
            />
          }
        />
        <Route
          path="/cart"
          element={
            <PlannerPage
              authUser={authUser}
              plannerItems={plannerItems}
              onRemoveItem={removePlannerItem}
              onCheckout={handleCheckoutSubmit}
            />
          }
        />
      </Routes>
  );

  const adminRoutes = (
    <Routes>
      <Route
        path="/admin"
        element={<Navigate to={authUser ? "/admin/dashboard" : "/admin/login"} replace />}
      />
      <Route
        path="/admin/login"
        element={
          <AdminAccessPage
            authUser={authUser}
            userRole={userRole}
            onAuthSubmit={handleAuthSubmit}
            onSignOut={handleSignOut}
          />
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <AdminSitePage
            authUser={authUser}
            userRole={userRole}
            stats={adminStats}
            profiles={profiles}
            vendors={vendors}
            products={products}
            orders={orders}
            services={services}
            onCreateProfile={handleProfileCreate}
            onCreateVendor={handleVendorCreate}
            onCreateProduct={handleProductCreate}
            onCreateService={handleServiceCreate}
          />
        }
      />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );

  if (adminPath) {
    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <img className="brand-logo" src="/borkeina-logo.svg" alt="Borkeina" />
            <div>
              <p className="eyebrow admin-eyebrow">Admin Site</p>
              <h1>Borkeina Console</h1>
            </div>
          </div>
          <nav className="admin-nav">
            <NavLink to="/admin/login">Admin Login</NavLink>
            <NavLink to="/admin/dashboard">Dashboard</NavLink>
            <a href={getPublicUrl("/")}>Public App</a>
          </nav>
          <div className="admin-sidebar-card">
            <strong>{authUser ? authUser.email : "Admin guest"}</strong>
            <span>Role: {userRole}</span>
            <p>{supabaseEnabled ? "Live Supabase connected" : "Demo mode active"}</p>
            {hostHints.adminUrl ? <p>Admin URL: {hostHints.adminUrl}</p> : null}
          </div>
        </aside>
        <main className="admin-content">{adminRoutes}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img className="brand-logo" src="/borkeina-logo.svg" alt="Borkeina" />
          <div>
            <p className="eyebrow">Matrimony + Wedding Marketplace</p>
            <h1>Borkeina</h1>
          </div>
        </div>
        <nav className="nav-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/matches">Matching</NavLink>
          <NavLink to="/shop">Boutique</NavLink>
          <NavLink to="/services">Services</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          <a href={getAdminUrl("/admin/login")}>Admin Site</a>
          <NavLink to="/cart">Cart ({plannerItems.length})</NavLink>
          <NavLink to="/auth">{navAuthLabel}</NavLink>
        </nav>
      </header>

      <section className="status-bar">
        <div>
          <strong>{supabaseEnabled ? "Supabase live mode" : "Demo mode active"}</strong>
          <p>{bannerMessage}</p>
        </div>
        <div className="status-side">
          <span>{isLoadingData ? "Syncing data..." : "Data ready"}</span>
          <span>{authUser ? `${authUser.email} | ${userRole}` : "Guest experience"}</span>
        </div>
      </section>

      {publicRoutes}

      <footer className="footer">
        <div>
          <h3>Supabase Status</h3>
          <p>
            {supabaseEnabled
              ? "Authentication, realtime chat, reads, and write actions are ready with your configured project."
              : "Using demo data. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable real persistence."}
          </p>
        </div>
        <div>
          <h3>Borkeina Flow</h3>
          <p>Sign in, unlock matching, shortlist biodata, and move seamlessly into shopping and service bookings.</p>
        </div>
      </footer>
    </div>
  );
}

function HomePage({
  metrics,
  highlights,
  categories,
  profiles,
  services,
  testimonials,
  addPlannerItem,
  shortlistedIds,
}) {
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Find your partner. Plan the celebration.</p>
          <h2>Borkeina brings matchmaking and wedding planning into one pink luxury experience.</h2>
          <p className="hero-text">
            Create biodata profiles, search meaningful matches, discover curated bridal products,
            and book verified wedding professionals across every ceremony and celebration.
          </p>
          <div className="hero-actions">
            <NavLink className="button primary" to="/matches">
              Start Matching
            </NavLink>
            <NavLink className="button secondary" to="/shop">
              Shop Borkeina Boutique
            </NavLink>
          </div>
          <div className="metrics-grid">
            {metrics.map((item) => (
              <article key={item.label} className="metric-card">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>
        <div className="hero-panel">
          <div className="floating-card accent">
            <span>Borkeina Matchmaking</span>
            <strong>{profiles.length} biodata profiles</strong>
            <p>Search by city, community, profession, and unlock matching after login.</p>
          </div>
          <div className="floating-card">
            <span>Borkeina Boutique</span>
            <strong>Products and services in one journey</strong>
            <p>Shop pink luxury essentials, gifting, decor, and wedding consultations in one place.</p>
          </div>
          <div className="floating-card dark">
            <span>Shortlist + Chat</span>
            <strong>{shortlistedIds.length} profile(s) shortlisted</strong>
            <p>Use realtime chat for biodata access, family coordination, vendor communication, and planning.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Platform Highlights</p>
          <h3>Designed for the full wedding journey</h3>
        </div>
        <div className="highlights-grid">
          {highlights.map((item) => (
            <article key={item.title} className="info-card">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section split-section">
        <div>
          <div className="section-heading">
            <p className="eyebrow">Borkeina Categories</p>
            <h3>Luxury wedding commerce with matchmaking at the center</h3>
          </div>
          <p className="support-text">
            Combine premium biodata memberships, featured profiles, products, vendor onboarding,
            service bookings, and consultation commissions in one branded platform.
          </p>
        </div>
        <div className="tag-grid">
          {categories.map((category) => (
            <span key={category} className="pill">
              {category}
            </span>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Featured Matches</p>
          <h3>Curated Borkeina biodata previews</h3>
        </div>
        <div className="cards-grid">
          {profiles.slice(0, 3).map((profile) => (
            <ProfileCard key={profile.id} profile={profile} addPlannerItem={addPlannerItem} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Top Services</p>
          <h3>Trusted Borkeina wedding professionals</h3>
        </div>
        <div className="cards-grid">
          {services.slice(0, 3).map((service) => (
            <ServiceCard key={service.id} service={service} addPlannerItem={addPlannerItem} />
          ))}
        </div>
      </section>

      <section className="section testimonials">
        <div className="section-heading">
          <p className="eyebrow">Success Stories</p>
          <h3>Families and couples can manage everything in one place</h3>
        </div>
        <div className="testimonial-grid">
          {testimonials.map((quote) => (
            <article key={quote.name} className="testimonial-card">
              <p>{quote.message}</p>
              <strong>{quote.name}</strong>
              <span>{quote.role}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MatchesPage({
  authUser,
  profiles,
  addPlannerItem,
  shortlistedIds,
  onToggleShortlist,
  onRequestAccess,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [communityFilter, setCommunityFilter] = useState("");

  const filteredProfiles = profiles.filter((profile) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesQuery =
      !query ||
      profile.name.toLowerCase().includes(query) ||
      profile.profession.toLowerCase().includes(query) ||
      profile.community.toLowerCase().includes(query);
    const matchesCity = !cityFilter || profile.city.toLowerCase().includes(cityFilter.toLowerCase());
    const matchesCommunity =
      !communityFilter || profile.community.toLowerCase().includes(communityFilter.toLowerCase());

    return matchesQuery && matchesCity && matchesCommunity;
  });

  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Borkeina Matching</p>
        <h2>Search, filter, shortlist, and request biodata access to compatible profiles.</h2>
      </div>
      {!authUser ? (
        <section className="section nested-section">
          <div className="section-heading compact">
            <p className="eyebrow">Members Only</p>
            <h3>Log in to unlock profile matching lists</h3>
          </div>
          <p className="support-text">
            Borkeina protects profile matching behind member login so families can browse biodata with more privacy and trust.
          </p>
          <div className="hero-actions">
            <NavLink className="button primary" to="/auth">
              Login To View Matches
            </NavLink>
          </div>
        </section>
      ) : (
        <>
          <section className="filter-bar">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, profession, or community"
            />
            <input
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              placeholder="Filter by city"
            />
            <input
              value={communityFilter}
              onChange={(event) => setCommunityFilter(event.target.value)}
              placeholder="Filter by religion, caste, or community"
            />
          </section>
          <div className="cards-grid">
            {filteredProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                addPlannerItem={addPlannerItem}
                shortlisted={shortlistedIds.includes(profile.id)}
                onToggleShortlist={onToggleShortlist}
                onRequestAccess={onRequestAccess}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function ShopPage({ products, addPlannerItem, reviews }) {
  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Borkeina Boutique</p>
        <h2>Browse pink luxury bridal fashion, jewelry, gifts, décor, and signature wedding essentials.</h2>
      </div>
      <div className="cards-grid">
        {products.map((product) => (
          <article key={product.id} className="shop-card">
            <div className="shop-card-header">
              <span>{product.category}</span>
              <strong>{product.price}</strong>
            </div>
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <div className="card-footer">
              <span>{product.vendor}</span>
              <button
                type="button"
                onClick={() =>
                  addPlannerItem({
                    id: product.id,
                    key: `product-${product.id}`,
                    kind: "product",
                    title: product.name,
                    subtitle: `${product.category} by ${product.vendor}`,
                    price: product.price,
                  })
                }
              >
                Add to cart
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="section nested-section">
        <div className="section-heading compact">
          <p className="eyebrow">Reviews & Ratings</p>
          <h3>Recent product feedback</h3>
        </div>
        <div className="cards-grid compact-grid">
          {reviews.slice(0, 2).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ServicesPage({ services, addPlannerItem, reviews }) {
  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Borkeina Services</p>
        <h2>Book photographers, planners, decorators, venues, beauty teams, and premium wedding partners.</h2>
      </div>
      <div className="cards-grid">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} addPlannerItem={addPlannerItem} />
        ))}
      </div>
      <section className="section nested-section">
        <div className="section-heading compact">
          <p className="eyebrow">Reviews & Ratings</p>
          <h3>Recent vendor feedback</h3>
        </div>
        <div className="cards-grid compact-grid">
          {reviews.slice(1).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ChatPage({ authUser, pushBanner }) {
  const [room, setRoom] = useState("general");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Demo chat mode active.");

  useEffect(() => {
    let mounted = true;
    let channel = null;

    async function loadMessages() {
      if (!supabaseEnabled) {
        setMessages([
          {
            id: "demo-1",
            sender_name: "Match Concierge",
            message: "Welcome to matchmaking and wedding planning chat.",
          },
        ]);
        setStatus("Demo chat mode active.");
        return;
      }

      const rows = await fetchChatMessages(room);

      if (!mounted) {
        return;
      }

      setMessages(rows);
      setStatus(`Realtime connected to room: ${room}`);
      channel = subscribeToRoom(room, (message) => {
        setMessages((current) => [...current, message]);
      });
    }

    loadMessages().catch((error) => {
      if (mounted) {
        setStatus(error.message || "Could not load chat messages.");
      }
    });

    return () => {
      mounted = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [room]);

  async function handleSend(event) {
    event.preventDefault();

    if (!draft.trim()) {
      return;
    }

    if (supabaseEnabled && !authUser) {
      pushBanner("Sign in first to use live chat.");
      return;
    }

    if (!supabaseEnabled) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          sender_name: authUser?.user_metadata?.full_name || "Demo user",
          message: draft,
        },
      ]);
      setDraft("");
      pushBanner("Demo chat message added.");
      return;
    }

    await sendChatMessage({
      room,
      sender_name: authUser?.user_metadata?.full_name || authUser?.email || "Member",
      sender_email: authUser?.email || null,
      message: draft,
    });

    setDraft("");
    pushBanner("Realtime chat message sent.");
  }

  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Realtime Chat</p>
        <h2>Use Supabase Realtime for family, matchmaking, and vendor conversations.</h2>
      </div>
      <section className="chat-layout">
        <div className="form-panel">
          <label>
            Chat room
            <input value={room} onChange={(event) => setRoom(event.target.value || "general")} />
          </label>
          <p className="inline-message">{status}</p>
          <div className="chat-feed">
            {messages.map((message) => (
              <article key={message.id} className="planner-card">
                <div>
                  <strong>{message.sender_name || "Member"}</strong>
                  <p>{message.message}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <form className="form-panel" onSubmit={handleSend}>
          <div className="section-heading compact">
            <p className="eyebrow">Send Message</p>
            <h3>Realtime conversation</h3>
          </div>
          <label>
            Message
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows="6"
              placeholder="Introduce yourself, request biodata access, or discuss a wedding requirement."
            />
          </label>
          <button type="submit" className="button primary">
            Send chat message
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminAccessPage({ authUser, userRole, onAuthSubmit, onSignOut }) {
  const adminHostMode = isAdminHostname();
  if (authUser && (userRole === "admin" || userRole === "vendor")) {
    return <Navigate to={adminHostMode ? "/" : "/admin/dashboard"} replace />;
  }

  return (
    <section className="admin-page-shell">
      <div className="section-heading">
        <p className="eyebrow">Borkeina Admin</p>
        <h2>Sign in to the Borkeina admin console.</h2>
      </div>
      <AuthPage authUser={authUser} onAuthSubmit={onAuthSubmit} onSignOut={onSignOut} />
    </section>
  );
}

function AdminSitePage(props) {
  const { authUser, userRole } = props;
  const adminHostMode = isAdminHostname();

  if (!authUser) {
    return <Navigate to={adminHostMode ? "/admin/login" : "/admin/login"} replace />;
  }

  if (userRole !== "admin" && userRole !== "vendor") {
    return (
      <section className="admin-page-shell">
        <div className="section-heading">
          <p className="eyebrow">Restricted Area</p>
          <h2>Your account does not have admin console access yet.</h2>
        </div>
        <article className="info-card">
          <p>Ask an existing admin to assign you the `admin` or `vendor` role in Supabase.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="admin-page-shell">
      <div className="section-heading">
        <p className="eyebrow">Borkeina Admin Dashboard</p>
        <h2>Dedicated console at `/admin/dashboard`</h2>
      </div>
      <AdminPage {...props} />
    </section>
  );
}

function AuthPage({ authUser, onAuthSubmit, onSignOut }) {
  const [mode, setMode] = useState("signin");
  const [formState, setFormState] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      await onAuthSubmit(formState, mode);
      setMessage(
        mode === "signup"
          ? "Account flow completed. Confirm email if your project requires it."
          : "Welcome back.",
      );
    } catch (error) {
      setMessage(error.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell auth-layout">
      <section className="auth-panel">
        <div className="section-heading">
          <p className="eyebrow">Authentication</p>
          <h2>{authUser ? "Your Borkeina account is active." : "Create or access your Borkeina account."}</h2>
        </div>
        <p className="support-text">
          Members can manage matching preferences, save boutique products, request services,
          and track wedding orders from one secure Borkeina account.
        </p>
        {authUser ? (
          <div className="account-summary">
            <strong>{authUser.user_metadata?.full_name || "Member account"}</strong>
            <span>{authUser.email}</span>
            <button type="button" className="button primary" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <form className="form-panel" onSubmit={handleSubmit}>
            <div className="tab-row">
              <button
                type="button"
                className={mode === "signin" ? "tab active" : "tab"}
                onClick={() => setMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === "signup" ? "tab active" : "tab"}
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </div>
            {mode === "signup" ? (
              <label>
                Full name
                <input
                  value={formState.fullName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
              </label>
            ) : null}
            <label>
              Email
              <input
                type="email"
                value={formState.email}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={formState.password}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </label>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        )}
      </section>
      <section className="auth-panel">
        <div className="section-heading">
          <p className="eyebrow">What unlocks next</p>
          <h3>Account-aware matching and wedding commerce</h3>
        </div>
        <ul className="feature-list">
          <li>Shortlist profiles and request privacy-controlled contact access.</li>
          <li>Save products and wedding services in one cart and checkout flow.</li>
          <li>Use realtime chat for vendor coordination and family communication.</li>
          <li>Expand into premium memberships, vendor subscriptions, and secure roles.</li>
        </ul>
      </section>
    </main>
  );
}

function AdminPage({
  authUser,
  userRole,
  stats,
  profiles,
  vendors,
  products,
  orders,
  services,
  onCreateProfile,
  onCreateVendor,
  onCreateProduct,
  onCreateService,
}) {
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    age: "",
    city: "",
    profession: "",
    education: "",
    community: "",
    preferences: "",
    bio: "",
    contactVisibility: "Request access",
    isVerified: true,
  });
  const [vendorForm, setVendorForm] = useState({
    businessName: "",
    vendorType: "",
    location: "",
    email: "",
    phone: "",
    rating: "",
    description: "",
  });
  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    price: "",
    vendorName: "",
    description: "",
  });
  const [serviceForm, setServiceForm] = useState({
    name: "",
    serviceType: "",
    basePrice: "",
    location: "",
    description: "",
  });
  const [message, setMessage] = useState("");
  const canManageMatchmaking = userRole === "admin";
  const canManageMarketplace = userRole === "admin" || userRole === "vendor";
  const canViewOrders = userRole === "admin";

  async function handleProfileSubmit(event) {
    event.preventDefault();

    if (!canManageMatchmaking) {
      setMessage("Only admins can publish matrimonial profiles.");
      return;
    }

    try {
      await onCreateProfile(profileForm);
      setProfileForm({
        fullName: "",
        age: "",
        city: "",
        profession: "",
        education: "",
        community: "",
        preferences: "",
        bio: "",
        contactVisibility: "Request access",
        isVerified: true,
      });
      setMessage("Profile created successfully.");
    } catch (error) {
      setMessage(error.message || "Could not create profile.");
    }
  }

  async function handleVendorSubmit(event) {
    event.preventDefault();

    if (!canManageMatchmaking) {
      setMessage("Only admins can onboard vendors.");
      return;
    }

    try {
      await onCreateVendor(vendorForm);
      setVendorForm({
        businessName: "",
        vendorType: "",
        location: "",
        email: "",
        phone: "",
        rating: "",
        description: "",
      });
      setMessage("Vendor created successfully.");
    } catch (error) {
      setMessage(error.message || "Could not create vendor.");
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();

    if (!canManageMarketplace) {
      setMessage("Only admins or vendors can publish products.");
      return;
    }

    try {
      await onCreateProduct(productForm);
      setProductForm({
        name: "",
        category: "",
        price: "",
        vendorName: "",
        description: "",
      });
      setMessage("Product created successfully.");
    } catch (error) {
      setMessage(error.message || "Could not create product.");
    }
  }

  async function handleServiceSubmit(event) {
    event.preventDefault();

    if (!canManageMarketplace) {
      setMessage("Only admins or vendors can publish services.");
      return;
    }

    try {
      await onCreateService(serviceForm);
      setServiceForm({
        name: "",
        serviceType: "",
        basePrice: "",
        location: "",
        description: "",
      });
      setMessage("Service listing created successfully.");
    } catch (error) {
      setMessage(error.message || "Could not create service listing.");
    }
  }

  const displayOrders = orders.length
    ? orders
    : [{ id: "demo", customerName: "Demo family", amount: "Rs. 7,500", status: "pending" }];

  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Admin Dashboard</p>
          <h2>Manage Borkeina matchmaking profiles, vendors, products, services, and orders.</h2>
      </div>

      <section className="dashboard-grid">
        {stats.map((item) => (
          <article key={item.label} className="metric-card">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <section className="section split-section admin-section">
        <div>
          <h3>Admin access</h3>
          <p className="support-text">
            {authUser
              ? `Signed in as ${authUser.email} with role ${userRole}.`
              : "You can test the dashboard in demo mode already. With Supabase auth enabled, this becomes your real admin flow."}
          </p>
          {message ? <p className="inline-message">{message}</p> : null}
        </div>
        <div className="tag-grid">
          <span className="pill">Profiles: {profiles.length}</span>
          <span className="pill">Vendors: {vendors.length}</span>
          <span className="pill">Products: {products.length}</span>
          <span className="pill">Services: {services.length}</span>
          <span className="pill">Orders: {canViewOrders ? displayOrders.length : "Admin only"}</span>
        </div>
      </section>

      <section className="section nested-section">
        <div className="section-heading compact">
          <p className="eyebrow">Order Management</p>
          <h3>Recent checkout activity</h3>
        </div>
        {canViewOrders ? (
          <div className="cards-grid compact-grid">
            {displayOrders.slice(0, 3).map((order) => (
              <article key={order.id} className="info-card">
                <h4>{order.customerName}</h4>
                <p>Status: {order.status}</p>
                <p>Amount: {order.amount}</p>
              </article>
            ))}
          </div>
        ) : (
          <article className="info-card">
            <h4>Restricted</h4>
            <p>Order management is visible only to admin users.</p>
          </article>
        )}
      </section>

      <section className="admin-grid">
        <form className="form-panel" onSubmit={handleProfileSubmit}>
          <div className="section-heading compact">
            <p className="eyebrow">Publish Profile</p>
            <h3>Add a Borkeina matrimonial profile</h3>
          </div>
          <label>
            Full name
            <input
              value={profileForm.fullName}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, fullName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Age
            <input
              value={profileForm.age}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, age: event.target.value }))
              }
            />
          </label>
          <label>
            City
            <input
              value={profileForm.city}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, city: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Profession
            <input
              value={profileForm.profession}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, profession: event.target.value }))
              }
            />
          </label>
          <label>
            Education
            <input
              value={profileForm.education}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, education: event.target.value }))
              }
            />
          </label>
          <label>
            Community
            <input
              value={profileForm.community}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, community: event.target.value }))
              }
            />
          </label>
          <label>
            Preferences
            <input
              value={profileForm.preferences}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, preferences: event.target.value }))
              }
              placeholder="Family-oriented, Progressive, City-based"
            />
          </label>
          <label>
            Privacy mode
            <input
              value={profileForm.contactVisibility}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, contactVisibility: event.target.value }))
              }
            />
          </label>
          <label>
            Biodata summary
            <textarea
              value={profileForm.bio}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, bio: event.target.value }))
              }
              rows="4"
            />
          </label>
          <button type="submit" className="button primary" disabled={!canManageMatchmaking}>
            Save profile
          </button>
        </form>

        <form className="form-panel" onSubmit={handleVendorSubmit}>
          <div className="section-heading compact">
            <p className="eyebrow">Vendor Onboarding</p>
            <h3>Add a Borkeina wedding vendor</h3>
          </div>
          <label>
            Business name
            <input
              value={vendorForm.businessName}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, businessName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Vendor type
            <input
              value={vendorForm.vendorType}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, vendorType: event.target.value }))
              }
              placeholder="Photography, Venue, Decor"
              required
            />
          </label>
          <label>
            Location
            <input
              value={vendorForm.location}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={vendorForm.email}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label>
            Phone
            <input
              value={vendorForm.phone}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </label>
          <label>
            Rating
            <input
              value={vendorForm.rating}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, rating: event.target.value }))
              }
              placeholder="4.8"
            />
          </label>
          <label>
            Description
            <textarea
              value={vendorForm.description}
              onChange={(event) =>
                setVendorForm((current) => ({ ...current, description: event.target.value }))
              }
              rows="4"
              required
            />
          </label>
          <button type="submit" className="button primary" disabled={!canManageMatchmaking}>
            Save vendor
          </button>
        </form>

        <form className="form-panel" onSubmit={handleProductSubmit}>
          <div className="section-heading compact">
            <p className="eyebrow">Publish Product</p>
            <h3>Add a boutique product</h3>
          </div>
          <label>
            Product name
            <input
              value={productForm.name}
              onChange={(event) =>
                setProductForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Category
            <input
              value={productForm.category}
              onChange={(event) =>
                setProductForm((current) => ({ ...current, category: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Price
            <input
              value={productForm.price}
              onChange={(event) =>
                setProductForm((current) => ({ ...current, price: event.target.value }))
              }
              placeholder="89000"
              required
            />
          </label>
          <label>
            Vendor name
            <input
              value={productForm.vendorName}
              onChange={(event) =>
                setProductForm((current) => ({ ...current, vendorName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={productForm.description}
              onChange={(event) =>
                setProductForm((current) => ({ ...current, description: event.target.value }))
              }
              rows="4"
              required
            />
          </label>
          <button type="submit" className="button primary" disabled={!canManageMarketplace}>
            Save product
          </button>
        </form>

        <form className="form-panel" onSubmit={handleServiceSubmit}>
          <div className="section-heading compact">
            <p className="eyebrow">Publish Service</p>
            <h3>Add a wedding service</h3>
          </div>
          <label>
            Service name
            <input
              value={serviceForm.name}
              onChange={(event) =>
                setServiceForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Service type
            <input
              value={serviceForm.serviceType}
              onChange={(event) =>
                setServiceForm((current) => ({ ...current, serviceType: event.target.value }))
              }
              placeholder="Photography"
              required
            />
          </label>
          <label>
            Starting price
            <input
              value={serviceForm.basePrice}
              onChange={(event) =>
                setServiceForm((current) => ({ ...current, basePrice: event.target.value }))
              }
              placeholder="75000"
            />
          </label>
          <label>
            Location
            <input
              value={serviceForm.location}
              onChange={(event) =>
                setServiceForm((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={serviceForm.description}
              onChange={(event) =>
                setServiceForm((current) => ({ ...current, description: event.target.value }))
              }
              rows="4"
              required
            />
          </label>
          <button type="submit" className="button primary" disabled={!canManageMarketplace}>
            Save service
          </button>
        </form>
      </section>
    </main>
  );
}

function PlannerPage({ authUser, plannerItems, onRemoveItem, onCheckout }) {
  const [formState, setFormState] = useState(initialCheckoutForm);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      await onCheckout(formState);
      setFormState(initialCheckoutForm);
      setMessage("Cart submitted. Vendors and admins can now follow up.");
    } catch (error) {
      setMessage(error.message || "Could not complete checkout.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Cart & Checkout</p>
        <h2>Collect matches, boutique products, and services before final checkout.</h2>
      </div>

      <section className="planner-grid">
        <div className="planner-column">
          <div className="section-heading compact">
            <p className="eyebrow">Saved Items</p>
            <h3>{plannerItems.length ? `${plannerItems.length} item(s) in cart` : "Cart is empty"}</h3>
          </div>
          <div className="planner-list">
            {plannerItems.length ? (
              plannerItems.map((item) => (
                <article key={item.key} className="planner-card">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                    <span>{item.price || "Custom inquiry"}</span>
                  </div>
                  <button type="button" className="remove-button" onClick={() => onRemoveItem(item.key)}>
                    Remove
                  </button>
                </article>
              ))
            ) : (
              <article className="empty-card">
                <p>Add matchmaking profiles, products, or services to start planning.</p>
              </article>
            )}
          </div>
        </div>

        <form className="form-panel" onSubmit={handleSubmit}>
          <div className="section-heading compact">
            <p className="eyebrow">Checkout</p>
            <h3>Customer and event details</h3>
          </div>
          <label>
            Full name
            <input
              value={formState.customerName}
              onChange={(event) =>
                setFormState((current) => ({ ...current, customerName: event.target.value }))
              }
              placeholder={authUser?.user_metadata?.full_name || "Bride, groom, or family member"}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={formState.customerEmail}
              onChange={(event) =>
                setFormState((current) => ({ ...current, customerEmail: event.target.value }))
              }
              placeholder={authUser?.email || "family@example.com"}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={formState.phone}
              onChange={(event) =>
                setFormState((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="+91"
              required
            />
          </label>
          <label>
            Event date
            <input
              type="date"
              value={formState.eventDate}
              onChange={(event) =>
                setFormState((current) => ({ ...current, eventDate: event.target.value }))
              }
            />
          </label>
          <label>
            Notes
            <textarea
              value={formState.note}
              onChange={(event) =>
                setFormState((current) => ({ ...current, note: event.target.value }))
              }
              rows="5"
              placeholder="Tell the team about guest count, city, ceremony type, or preferred timeline."
            />
          </label>
          <button type="submit" className="button primary" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Confirm checkout"}
          </button>
          {message ? <p className="inline-message">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}

function ProfileCard({
  profile,
  addPlannerItem,
  shortlisted = false,
  onToggleShortlist,
  onRequestAccess,
}) {
  return (
    <article className="profile-card">
      <div className="avatar-badge">{profile.name.slice(0, 1)}</div>
      <div className="profile-header">
        <h3>{profile.name}</h3>
        <span>{profile.age} yrs</span>
      </div>
      <p>{profile.city}</p>
      <ul className="profile-list">
        <li>{profile.profession}</li>
        <li>{profile.education}</li>
        <li>{profile.community}</li>
      </ul>
      <div className="chip-row">
        {profile.preferences.map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>
      <p className="privacy-line">{profile.privacy || "Request access"}</p>
      <button
        type="button"
        onClick={() =>
          addPlannerItem({
            id: profile.id,
            key: `match-${profile.id}`,
            kind: "match",
            title: profile.name,
            subtitle: `${profile.city} | ${profile.profession}`,
            price: "Interest request",
          })
        }
      >
        Express interest
      </button>
      {onToggleShortlist ? (
        <button type="button" className="secondary-button" onClick={() => onToggleShortlist(profile.id)}>
          {shortlisted ? "Remove shortlist" : "Shortlist profile"}
        </button>
      ) : null}
      {onRequestAccess ? (
        <button type="button" className="secondary-button" onClick={() => onRequestAccess(profile)}>
          Request contact access
        </button>
      ) : null}
    </article>
  );
}

function ServiceCard({ service, addPlannerItem }) {
  return (
    <article className="service-card">
      <div className="shop-card-header">
        <span>{service.type}</span>
        <strong>{service.price}</strong>
      </div>
      <h3>{service.name}</h3>
      <p>{service.description}</p>
      <div className="service-meta">
        <span>{service.location}</span>
        <span>{service.rating} rating</span>
      </div>
      <button
        type="button"
        onClick={() =>
          addPlannerItem({
            id: service.id,
            key: `service-${service.id}`,
            kind: "service",
            title: service.name,
            subtitle: `${service.type} | ${service.location}`,
            price: service.price,
          })
        }
      >
        Book consultation
      </button>
    </article>
  );
}

function ReviewCard({ review }) {
  return (
    <article className="info-card">
      <h4>{review.target}</h4>
      <p>{review.comment}</p>
      <strong>{review.name}</strong>
      <span>{review.rating}/5</span>
    </article>
  );
}

function mapProfileRecord(record) {
  return {
    id: record.id,
    name: record.full_name || "Member profile",
    age: record.age ?? "-",
    city: record.city || "Location pending",
    profession: record.profession || "Profession pending",
    education: record.education || "Education pending",
    community: record.community || "Community optional",
    preferences: Array.isArray(record.preferences) && record.preferences.length
      ? record.preferences
      : ["Profile active"],
    privacy: record.contact_visibility || "Request access",
  };
}

function mapProductRecord(record) {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    price: formatRupees(record.price),
    vendor: record.vendor_name || "Partner vendor",
    description: record.description || "Wedding product listing",
  };
}

function mapServiceRecord(record) {
  return {
    id: record.id,
    name: record.name,
    type: record.service_type || record.type || "Wedding service",
    price: record.base_price ? `Starts ${formatRupees(record.base_price)}` : record.price || "Custom quote",
    location: record.location || "Flexible",
    rating: record.rating ? `${record.rating}/5` : "New",
    description: record.description || "Wedding service listing",
  };
}

function mapVendorRecord(record) {
  return {
    id: record.id,
    businessName: record.business_name,
    vendorType: record.vendor_type,
    location: record.location || "Flexible",
    email: record.email || "Pending",
    phone: record.phone || "Pending",
    rating: record.rating || "0",
  };
}

function mapOrderRecord(record) {
  return {
    id: record.id,
    customerName: record.customer_name || "Customer",
    amount: formatRupees(record.total_amount),
    status: record.order_status || "pending",
  };
}

function splitPreferences(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatRupees(value) {
  if (value === null || value === undefined || value === "") {
    return "Custom quote";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `Rs. ${numericValue.toLocaleString("en-IN")}`;
}

function buildInquiryMessage(item, formState) {
  const parts = [
    `Planner request for ${item.title}`,
    `Type: ${item.kind}`,
    formState.phone ? `Phone: ${formState.phone}` : null,
    formState.eventDate ? `Event date: ${formState.eventDate}` : null,
    formState.note ? `Notes: ${formState.note}` : null,
  ];

  return parts.filter(Boolean).join(" | ");
}

export default App;
