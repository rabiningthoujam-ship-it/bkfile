import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return supabase;
}

async function runSelect(tableName) {
  const client = requireSupabase();
  const { data, error } = await client.from(tableName).select("*").order("created_at", {
    ascending: false,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function runInsert(tableName, payload) {
  const client = requireSupabase();
  const { data, error } = await client.from(tableName).insert(payload).select().single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getCurrentSession() {
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

export async function fetchCurrentUserRole() {
  if (!supabase) {
    return "guest";
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return "guest";
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.role || "member";
}

export async function signUpUser(email, password, metadata = {}) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signInUser(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOutUser() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function fetchProfiles() {
  return runSelect("profiles");
}

export async function fetchVendors() {
  return runSelect("vendors");
}

export async function fetchProducts() {
  return runSelect("products");
}

export async function fetchServices() {
  return runSelect("services");
}

export async function fetchOrders() {
  return runSelect("orders");
}

export async function fetchChatMessages(room = "general") {
  const client = requireSupabase();
  const { data, error } = await client
    .from("messages")
    .select("*")
    .eq("room", room)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function insertProduct(payload) {
  return runInsert("products", {
    name: payload.name,
    category: payload.category,
    description: payload.description,
    price: Number(payload.price) || 0,
    vendor_name: payload.vendorName,
    stock: 1,
    is_featured: false,
  });
}

export async function insertProfile(payload) {
  const preferences = payload.preferences
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return runInsert("profiles", {
    full_name: payload.fullName,
    age: Number(payload.age) || null,
    city: payload.city,
    profession: payload.profession,
    education: payload.education,
    community: payload.community,
    bio: payload.bio,
    preferences,
    contact_visibility: payload.contactVisibility,
    is_verified: payload.isVerified,
  });
}

export async function insertVendor(payload) {
  return runInsert("vendors", {
    business_name: payload.businessName,
    vendor_type: payload.vendorType,
    location: payload.location,
    description: payload.description,
    phone: payload.phone,
    email: payload.email,
    rating: payload.rating ? Number(payload.rating) : 0,
  });
}

export async function insertService(payload) {
  return runInsert("services", {
    name: payload.name,
    service_type: payload.serviceType,
    location: payload.location,
    description: payload.description,
    base_price: Number(payload.basePrice) || 0,
  });
}

export async function createInquiry(payload) {
  return runInsert("inquiries", payload);
}

export async function createOrder(payload) {
  return runInsert("orders", payload);
}

export async function sendChatMessage(payload) {
  return runInsert("messages", payload);
}

export function subscribeToRoom(room, onMessage) {
  const client = requireSupabase();

  return client
    .channel(`messages:${room}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room=eq.${room}`,
      },
      (payload) => {
        onMessage(payload.new);
      },
    )
    .subscribe();
}
