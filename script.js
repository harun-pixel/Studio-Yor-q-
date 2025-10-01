// Variabel untuk URL API Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbyP4GNlgJh5z4788uhGgtpgCk_2t24C0N5pOj4fLrBOJdKLPWgvHlXm-S6sD6isbszT/exec';
// Variabel untuk menyimpan data booking
let selectedPackage = null;
let selectedDate = null;
let selectedTimeSlot = null;
// Fungsi untuk mendapatkan nama depan dari nama lengkap
function getFirstName(fullName) {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}
// Variabel untuk status login
let isLoggedIn = false;
let currentUser = null;
// Variabel untuk menandai bahwa user mencoba melakukan booking
let isAttemptingBooking = false;

// Harga paket
const packagePrices = {
    'Thr. Jorn Session': {
        '1 hr': 150000,
        '3 hr': 400000,
        '6 hr': 700000,
        '12 hr': 1200000
    },
    'Half Day Jorn Session': {
        '6 hr': 700000
    },
    'Full Day Jorn Session': {
        '12 hr': 1200000
    }
};

// Variabel untuk cache data booking per bulan
let monthlyBookingsCache = {};
let currentMonthYear = null;

// Fungsi untuk mendapatkan booking berdasarkan tanggal
async function getBookingsByDate(date) {
    const formattedDate = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    try {
        // Tambahkan timestamp untuk mencegah cache
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}?action=getBookings&date=${formattedDate}&_=${timestamp}`);
        const data = await response.json();
        if (data.status === 'success') {
            return data.bookings;
        } else {
            console.error('Error getting bookings:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
}

// Fungsi untuk mendapatkan semua booking dalam sebulan
async function getBookingsByMonth(year, month) {
    const cacheKey = `${year}-${month}`;
    
    // Cek apakah data sudah ada di cache
    if (monthlyBookingsCache[cacheKey]) {
        return monthlyBookingsCache[cacheKey];
    }
    
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}?action=getBookingsByMonth&year=${year}&month=${month + 1}&_=${timestamp}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Simpan ke cache
            monthlyBookingsCache[cacheKey] = data.bookings;
            return data.bookings;
        } else {
            console.error('Error getting bookings:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
}

// Fungsi untuk mengecek apakah tanggal sudah penuh
function isDateFullyBooked(date, monthlyBookings) {
    const dateString = date.toISOString().split('T')[0];
    const bookingsForDate = monthlyBookings.filter(booking => booking.date === dateString);
    
    // Total slot waktu yang tersedia (9 AM - 8 PM)
    const totalSlots = 12;
    
    // Jika semua slot sudah dipesan, tanggal tidak tersedia
    return bookingsForDate.length >= totalSlots;
}

// Fungsi untuk menambah booking baru
async function addBooking(name, email, phone, packageName, date, time) {
    const formattedDate = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    try {
        const response = await fetch(`${API_URL}?action=addBooking&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&package=${encodeURIComponent(packageName)}&date=${formattedDate}&time=${encodeURIComponent(time)}&userId=${encodeURIComponent(currentUser.id)}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error adding booking:', error);
        return { status: 'error', message: 'Network error. Please try again.' };
    }
}

// Fungsi untuk registrasi pengguna baru
async function register(name, email, password) {
    try {
        const response = await fetch(`${API_URL}?action=addUser&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Auto login setelah registrasi
            currentUser = data.user;
            isLoggedIn = true;
            
            // Simpan data user di localStorage untuk session
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Perbarui tampilan
            updateUserInterface();
            
            // Cek apakah user mencoba booking sebelum registrasi
            if (isAttemptingBooking) {
                isAttemptingBooking = false; // Reset penanda
                setTimeout(() => {
                    openBookingModal(); // Buka modal booking setelah registrasi
                }, 500);
            }
            
            return { success: true, message: data.message };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Error during registration:', error);
        return { success: false, message: 'Network error. Please try again.' };
    }
}

// Fungsi untuk login
async function login(email, password) {
    try {
        const response = await fetch(`${API_URL}?action=authenticateUser&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Simpan data user yang login
            currentUser = data.user;
            isLoggedIn = true;
            
            // Simpan data user di localStorage untuk session
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Perbarui tampilan
            updateUserInterface();
            
            // Cek apakah user mencoba booking sebelum login
            if (isAttemptingBooking) {
                isAttemptingBooking = false; // Reset penanda
                setTimeout(() => {
                    openBookingModal(); // Buka modal booking setelah login
                }, 500);
            }
            
            return { success: true, message: 'Login berhasil' };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Error during login:', error);
        return { success: false, message: 'Network error. Please try again.' };
    }
}

// Fungsi untuk memeriksa status login saat halaman dimuat
function checkLoginStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        isLoggedIn = true;
        updateUserInterface();
    }
}

// Fungsi untuk memperbarui tampilan berdasarkan status login
function updateUserInterface() {
  const iconGroup = document.querySelector('.icon-group');
  const userMenu = document.querySelector('.user-menu');
  const riwayatNavLink = document.querySelector('.riwayat-nav-link');
  
  if (isLoggedIn && currentUser) {
      // Sembunyikan tombol login default
      if (iconGroup) {
          iconGroup.style.display = 'none';
      }
      
      // Tampilkan link riwayat di navbar right
      if (riwayatNavLink) {
          riwayatNavLink.style.display = 'inline-block';
      }
      
      // Tampilkan menu user
      if (!userMenu) {
          const navbarRight = document.querySelector('.navbar-right');
          const newUserMenu = document.createElement('div');
          newUserMenu.className = 'user-menu';
          newUserMenu.innerHTML = `
              <div class="user-info">
                  <div class="user-greeting">
                      Hi, ${getFirstName(currentUser.name)} <span>👋</span>
                  </div>
                  <div class="user-avatar">${getFirstName(currentUser.name).charAt(0).toUpperCase()}</div>
              </div>
              <div class="user-dropdown">
                  <a href="#" class="user-dropdown-item" id="riwayatLink">
                      <i class="fas fa-history"></i> Riwayat Pembelian
                  </a>
                  <a href="#" class="user-dropdown-item" id="logoutBtn">
                      <i class="fas fa-sign-out-alt"></i> Logout
                  </a>
              </div>
          `;
          navbarRight.appendChild(newUserMenu);
          
          // Tambahkan event listener
          const userInfo = newUserMenu.querySelector('.user-info');
          const userDropdown = newUserMenu.querySelector('.user-dropdown');
          const riwayatLink = newUserMenu.querySelector('#riwayatLink');
          const logoutBtn = newUserMenu.querySelector('#logoutBtn');
          
          userInfo.addEventListener('click', () => {
              userDropdown.classList.toggle('active');
          });
          
          riwayatLink.addEventListener('click', (e) => {
              e.preventDefault();
              showRiwayatSection();
              userDropdown.classList.remove('active');
          });
          
          logoutBtn.addEventListener('click', (e) => {
              e.preventDefault();
              logout();
          });
      }
  } else {
      // Tampilkan tombol login default
      if (iconGroup) {
          iconGroup.style.display = 'flex';
      }
      
      // Sembunyikan link riwayat di navbar right
      if (riwayatNavLink) {
          riwayatNavLink.style.display = 'none';
      }
      
      // Hapus menu user jika ada
      if (userMenu) {
          userMenu.remove();
      }
  }
}

// Fungsi untuk menampilkan halaman riwayat
function showRiwayatSection() {
    // Sembunyikan semua section
    document.querySelectorAll('section, .google-map-container').forEach(element => {
        element.style.display = 'none';
    });
    
    // Tampilkan section riwayat
    const riwayatSection = document.getElementById('riwayat');
    if (riwayatSection) {
        riwayatSection.style.display = 'block';
    }
    
    // Load riwayat pembelian
    loadRiwayatPembelian();
    
    // Scroll ke atas
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Fungsi untuk memuat riwayat pembelian dari backend
async function loadRiwayatPembelian() {
    const riwayatList = document.getElementById('riwayatList');
    if (!riwayatList) return;
    
    // Kosongkan daftar riwayat
    riwayatList.innerHTML = '<p class="loading">Memuat riwayat pembelian...</p>';
    
    try {
        // Ambil data riwayat dari backend
        const response = await fetch(`${API_URL}?action=getUserBookings&userId=${currentUser.id}`);
        const data = await response.json();
        
        riwayatList.innerHTML = '';
        
        if (data.status === 'success' && data.bookings.length > 0) {
            // Tampilkan riwayat pembelian
            data.bookings.forEach(item => {
                const riwayatCard = document.createElement('div');
                riwayatCard.className = 'riwayat-card';
                riwayatCard.innerHTML = `
                    <div class="riwayat-card-header">
                        <h3 class="riwayat-card-title">${item.packageName}</h3>
                        <span class="riwayat-card-status ${item.status === 'completed' ? 'status-completed' : 'status-upcoming'}">
                            ${item.status === 'completed' ? 'Selesai' : 'Akan Datang'}
                        </span>
                    </div>
                    <div class="riwayat-card-details">
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Tanggal:</span>
                            <span class="riwayat-card-detail-value">${item.date}</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Waktu:</span>
                            <span class="riwayat-card-detail-value">${item.time}</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Total:</span>
                            <span class="riwayat-card-detail-value">IDR ${parseInt(item.total).toLocaleString('id-ID')}.00</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Booking ID:</span>
                            <span class="riwayat-card-detail-value">${item.id}</span>
                        </div>
                    </div>
                    <div class="riwayat-card-actions">
                        <button class="riwayat-card-btn btn-view">Lihat Detail</button>
                        <button class="riwayat-card-btn btn-download">Download Tiket</button>
                    </div>
                `;
                riwayatList.appendChild(riwayatCard);
            });
        } else {
            riwayatList.innerHTML = '<p class="no-riwayat">Belum ada riwayat pembelian</p>';
        }
    } catch (error) {
        console.error('Error loading riwayat:', error);
        riwayatList.innerHTML = '<p class="error-riwayat">Gagal memuat riwayat pembelian</p>';
    }
}

// Fungsi untuk filter riwayat
function filterRiwayat(filter) {
    const riwayatCards = document.querySelectorAll('.riwayat-card');
    
    riwayatCards.forEach(card => {
        if (filter === 'all') {
            card.style.display = 'block';
        } else {
            const status = card.querySelector('.riwayat-card-status');
            if (filter === 'upcoming' && status.classList.contains('status-upcoming')) {
                card.style.display = 'block';
            } else if (filter === 'completed' && status.classList.contains('status-completed')) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        }
    });
}

// Fungsi untuk logout
function logout() {
    // Hapus data dari localStorage
    localStorage.removeItem('currentUser');
    
    // Reset status
    isLoggedIn = false;
    currentUser = null;
    
    // Perbarui tampilan
    updateUserInterface();
    
    // Kembali ke halaman utama
    showInitialView();
}

// Fungsi untuk validasi form registrasi
function validateRegisterForm() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    let isValid = true;
    
    // Reset error states
    document.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('error');
    });
    document.querySelectorAll('.error-message').forEach(msg => {
        msg.style.display = 'none';
    });
    
    // Validasi nama
    if (!name) {
        showFieldError('registerName', 'Nama harus diisi');
        isValid = false;
    }
    
    // Validasi email
    if (!email) {
        showFieldError('registerEmail', 'Email harus diisi');
        isValid = false;
    } else if (!isValidEmail(email)) {
        showFieldError('registerEmail', 'Email tidak valid');
        isValid = false;
    }
    
    // Validasi password
    if (!password) {
        showFieldError('registerPassword', 'Password harus diisi');
        isValid = false;
    } else if (password.length < 6) {
        showFieldError('registerPassword', 'Password minimal 6 karakter');
        isValid = false;
    }
    
    // Validasi konfirmasi password
    if (!confirmPassword) {
        showFieldError('confirmPassword', 'Konfirmasi password harus diisi');
        isValid = false;
    } else if (password !== confirmPassword) {
        showFieldError('confirmPassword', 'Password tidak cocok');
        isValid = false;
    }
    
    return isValid;
}

// Fungsi untuk validasi form login
function validateLoginForm() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    let isValid = true;
    
    // Reset error states
    document.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('error');
    });
    document.querySelectorAll('.error-message').forEach(msg => {
        msg.style.display = 'none';
    });
    
    // Validasi email
    if (!email) {
        showFieldError('loginEmail', 'Email harus diisi');
        isValid = false;
    } else if (!isValidEmail(email)) {
        showFieldError('loginEmail', 'Email tidak valid');
        isValid = false;
    }
    
    // Validasi password
    if (!password) {
        showFieldError('loginPassword', 'Password harus diisi');
        isValid = false;
    }
    
    return isValid;
}

// Fungsi untuk menampilkan error pada field
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    const errorMessage = formGroup.querySelector('.error-message');
    
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
    
    formGroup.classList.add('error');
}

// Fungsi untuk menampilkan pesan di form
function showFormMessage(formId, message, type) {
    const formMessage = document.getElementById(formId + 'Message');
    if (formMessage) {
        formMessage.textContent = message;
        formMessage.className = 'form-message ' + type;
        formMessage.style.display = 'block';
        
        // Sembunyikan pesan setelah 5 detik
        setTimeout(() => {
            formMessage.style.display = 'none';
        }, 5000);
    }
}

// Fungsi untuk validasi format email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Fungsi menghasilkan kalender yang dioptimalkan
async function generateCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
  
  document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarDays = document.getElementById('calendarDays');
  calendarDays.innerHTML = '<div class="calendar-loading">Loading calendar...</div>';
  
  // Ambil semua booking untuk bulan ini sekaligus
  const monthlyBookings = await getBookingsByMonth(year, month);
  
  // Hapus loading indicator
  calendarDays.innerHTML = '';
  
  // Dapatkan tanggal hari ini untuk perbandingan
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
  
  // Hari kosong sebelum bulan dimulai
  for (let i = 0; i < firstDay; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.className = 'calendar-day other-month';
      calendarDays.appendChild(emptyDay);
  }
  
  // Hari dalam bulan
  for (let day = 1; day <= daysInMonth; day++) {
      const dayElement = document.createElement('div');
      dayElement.className = 'calendar-day';
      dayElement.textContent = day;
      
      // Cek ketersediaan untuk tanggal ini
      const currentDate = new Date(year, month, day);
      currentDate.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
      
      // Cek apakah tanggal sudah lewat
      const isPastDate = currentDate < today;
      
      // Jika tanggal sudah lewat, tandai sebagai tidak tersedia
      if (isPastDate) {
          dayElement.classList.add('unavailable', 'past-date');
          dayElement.title = "This date has passed";
      } else {
          // Cek apakah semua slot waktu sudah dipesan
          if (isDateFullyBooked(currentDate, monthlyBookings)) {
              dayElement.classList.add('unavailable');
              dayElement.title = "All time slots are booked";
          }
      }
      
      dayElement.addEventListener('click', function () {
          if (!this.classList.contains('unavailable')) {
              document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
              this.classList.add('selected');
              updateAvailabilityStatus(year, month, day, monthlyBookings);
          }
      });
      
      calendarDays.appendChild(dayElement);
  }
  
  // Simpan bulan saat ini untuk cache
  currentMonthYear = `${year}-${month}`;
}

// Update status ketersediaan tanggal yang dioptimalkan
function updateAvailabilityStatus(year, month, day, monthlyBookings) {
  const availabilityStatus = document.getElementById('availabilityStatus');
  const date = new Date(year, month, day);
  
  // Dapatkan tanggal hari ini untuk perbandingan
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
  date.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
  
  // Cek apakah tanggal sudah lewat
  if (date < today) {
      availabilityStatus.textContent = 'This date has passed';
      availabilityStatus.style.color = '#ff4d4d';
  } else {
      // Cek apakah ada slot tersedia
      if (isDateFullyBooked(date, monthlyBookings)) {
          availabilityStatus.textContent = 'All time slots are booked';
          availabilityStatus.style.color = '#ff4d4d';
      } else {
          availabilityStatus.textContent = 'Available time slots';
          availabilityStatus.style.color = '#4dff4d';
      }
  }
}

// Generate time slots dengan cek booking dari API dan validasi waktu sekarang
async function generateTimeSlots() {
  const timeSlotsGrid = document.getElementById('timeSlotsGrid');
  timeSlotsGrid.innerHTML = '<p class="loading">Loading available time slots...</p>';
  
  const bookings = await getBookingsByDate(selectedDate);
  const startHour = 9;
  const endHour = 20;
  const now = new Date();
  const isToday = selectedDate.toDateString() === now.toDateString();
  
  // Clear loading message
  timeSlotsGrid.innerHTML = '';
  
  for (let hour = startHour; hour <= endHour; hour++) {
      const timeSlot = document.createElement('div');
      timeSlot.className = 'time-slot';
      const period = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour % 12 || 12;
      const timeString = `${displayHour}:00 ${period}`;
      
      // Cek apakah slot sudah dipesan
      const isBooked = bookings.some(booking => booking.time === timeString);
      
      // Cek apakah waktu slot sudah lewat jika tanggal hari ini
      const slotDateTime = new Date(selectedDate);
      slotDateTime.setHours(hour, 0, 0, 0);
      const isPast = isToday && slotDateTime <= now;
      
      if (isBooked || isPast) {
          timeSlot.classList.add('unavailable');
          // Tambahkan indikator visual untuk slot yang sudah dipesan
          if (isBooked) {
              timeSlot.innerHTML = `${timeString}<br><small>Already Booked</small>`;
              timeSlot.style.backgroundColor = '#444';
              timeSlot.style.color = '#999';
          } else if (isPast) {
              timeSlot.innerHTML = `${timeString}<br><small>Past Time</small>`;
              timeSlot.style.backgroundColor = '#333';
              timeSlot.style.color = '#777';
          }
      } else {
          timeSlot.textContent = timeString;
          timeSlot.addEventListener('click', function () {
              document.querySelectorAll('.time-slot').forEach(slot => slot.classList.remove('selected'));
              this.classList.add('selected');
              selectedTimeSlot = timeString;
          });
      }
      
      timeSlotsGrid.appendChild(timeSlot);
  }
  
  // Check if all slots are booked
  const availableSlots = timeSlotsGrid.querySelectorAll('.time-slot:not(.unavailable)');
  if (availableSlots.length === 0) {
      timeSlotsGrid.innerHTML = '<p class="no-slots">No available time slots for this date</p>';
  }
}

// Fungsi untuk menampilkan modal login required
function showLoginRequiredModal() {
    const loginRequiredModal = document.getElementById('loginRequiredModal');
    if (loginRequiredModal) {
        loginRequiredModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// Fungsi untuk menutup modal login required
function closeLoginRequiredModal() {
    const loginRequiredModal = document.getElementById('loginRequiredModal');
    if (loginRequiredModal) {
        loginRequiredModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Periksa status login saat halaman dimuat
    checkLoginStatus();
    
    // Modal registrasi
    const registerModal = document.getElementById('registerModal');
    const closeRegisterModalBtn = document.querySelector('.close-register-modal');
    const registerForm = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const loginFromRegisterBtn = document.getElementById('loginFromRegisterBtn');
    
    // Modal login required
    const loginRequiredModal = document.getElementById('loginRequiredModal');
    const closeLoginRequiredBtn = document.querySelector('.close-login-required-modal');
    const cancelLoginBtn = document.getElementById('cancelLoginBtn');
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    const loginModal = document.getElementById('loginModal');
    
    // Event listener untuk modal login required
    if (closeLoginRequiredBtn) {
        closeLoginRequiredBtn.addEventListener('click', closeLoginRequiredModal);
    }
    
    if (cancelLoginBtn) {
        cancelLoginBtn.addEventListener('click', () => {
            isAttemptingBooking = false; // Reset penanda
            closeLoginRequiredModal();
        });
    }
    
    if (goToLoginBtn) {
        goToLoginBtn.addEventListener('click', () => {
            closeLoginRequiredModal();
            if (loginModal) {
                loginModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Tutup modal login required saat klik di luar
    window.addEventListener('click', (e) => {
        if (e.target === loginRequiredModal) {
            isAttemptingBooking = false; // Reset penanda
            closeLoginRequiredModal();
        }
    });
    
    // Menutup dropdown saat klik di luar
    document.addEventListener('click', (e) => {
        const userMenu = document.querySelector('.user-menu');
        if (userMenu) {
            const userInfo = userMenu.querySelector('.user-info');
            const userDropdown = userMenu.querySelector('.user-dropdown');
            
            if (!userInfo.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        }
    });
    
    // Buka modal registrasi saat tombol register diklik
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            if (loginModal) loginModal.style.display = 'none';
            if (registerModal) {
                registerModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Buka modal login dari modal registrasi
    if (loginFromRegisterBtn) {
        loginFromRegisterBtn.addEventListener('click', () => {
            if (registerModal) registerModal.style.display = 'none';
            if (loginModal) {
                loginModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Tutup modal registrasi
    if (closeRegisterModalBtn) {
        closeRegisterModalBtn.addEventListener('click', () => {
            if (registerModal) {
                registerModal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }
    
    // Tutup modal saat klik di luar
    window.addEventListener('click', e => {
        if (e.target === registerModal) {
            registerModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
    
    // Proses registrasi form
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateRegisterForm()) {
                return;
            }
            
            const name = document.getElementById('registerName').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            
            // Tampilkan loading state
            const submitButton = registerForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;
            
            // Panggil fungsi register
            const result = await register(name, email, password);
            
            // Kembalikan tombol ke state semula
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            
            if (result.success) {
                showFormMessage('registerForm', result.message, 'success');
                
                // Tunggu sebentar sebelum menutup modal
                setTimeout(() => {
                    if (registerModal) {
                        registerModal.style.display = 'none';
                        document.body.style.overflow = 'auto';
                    }
                }, 1500);
            } else {
                showFormMessage('registerForm', result.message, 'error');
            }
        });
    }
    
    // Navbar Hamburger Menu Toggle (untuk mobile)
    const hamburger = document.querySelector('.hamburger-menu');
    const navMenu = document.querySelector('.nav-menu');
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('nav-menu-active');
            hamburger.classList.toggle('is-active');
        });
    }
    
    // Navigasi dan Kontrol Tampilan Section
    const allLinks = document.querySelectorAll('.nav-link');
    const navbar = document.querySelector('.navbar');
    const googleMapContainer = document.querySelector('.google-map-container');
    
    // Fungsi untuk menampilkan semua bagian utama website
    function showInitialView() {
        const sectionsToShow = [
            '.hero-section',
            '.welcome-section',
            '.services-section',
            '.studio-facilities-gallery-section',
            '.testimonials-section',
            '.google-map-container',
            '.contact-section',
            '.footer'
        ];
        
        // Sembunyikan semua section terlebih dahulu
        document.querySelectorAll('section, .google-map-container').forEach(element => {
            element.style.display = 'none';
        });
        
        // Tampilkan section utama
        sectionsToShow.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) element.style.display = 'block';
        });
        
        // Tentukan about section tetap tersembunyi
        const aboutSection = document.getElementById('about');
        if (aboutSection) aboutSection.style.display = 'none';
        
        // Scroll ke atas halaman
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Panggil fungsi saat halaman pertama kali dimuat
    showInitialView();
    
    allLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            
            if (targetId === '' || targetId === 'home') {
                showInitialView();
            } else if (targetId === 'riwayat') {
                // Periksa apakah user sudah login
                if (isLoggedIn) {
                    showRiwayatSection();
                } else {
                    // Tampilkan modal login required
                    isAttemptingBooking = false; // Reset penanda
                    showLoginRequiredModal();
                }
            } else {
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    document.querySelectorAll('section, .google-map-container').forEach(element => {
                        element.style.display = 'none';
                    });
                    targetSection.style.display = 'block';
                    if (targetId === 'kontak' && googleMapContainer) {
                        googleMapContainer.style.display = 'block';
                    }
                    const navbarHeight = navbar.offsetHeight;
                    window.scrollTo({
                        top: targetSection.offsetTop - navbarHeight,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // Modal Booking Functionality
    const modal = document.getElementById('bookingModal');
    const calendarModal = document.getElementById('calendarModal');
    const timeSlotsModal = document.getElementById('timeSlotsModal');
    const checkoutModal = document.getElementById('checkoutModal');
    const bookSessionButtons = document.querySelectorAll('.btn-book-session');
    const viewPackagesButton = document.querySelector('a[href="#packages"]');
    const closeModal = document.querySelector('.close-modal');
    const closeCalendarModalBtn = document.querySelector('.close-calendar-modal');
    const closeTimeSlotsModalBtn = document.querySelector('.close-time-slots-modal');
    const closeCheckoutModalBtn = document.querySelector('.close-checkout-modal');
    const closeLoginModalBtn = document.querySelector('.close-login-modal');
    const loginForm = document.getElementById('loginForm');
    const iconGroup = document.querySelector('.icon-group');
    
    // Link untuk membuka modal registrasi dari modal login
    const registerLink = document.getElementById('registerLink');
    if (registerLink) {
        registerLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginModal) loginModal.style.display = 'none';
            if (registerModal) {
                registerModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Link untuk membuka modal login dari modal registrasi
    const loginLink = document.getElementById('loginLink');
    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (registerModal) registerModal.style.display = 'none';
            if (loginModal) {
                loginModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    function openBookingModal() {
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }
    
    function closeBookingModal() {
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
    
    // Modifikasi event listener tombol "Book Session"
    bookSessionButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isLoggedIn) {
                openBookingModal();
            } else {
                // Tandai bahwa user mencoba booking
                isAttemptingBooking = true;
                showLoginRequiredModal();
            }
        });
    });
    
    if (viewPackagesButton) {
        viewPackagesButton.addEventListener('click', e => {
            e.preventDefault();
            if (isLoggedIn) {
                openBookingModal();
            } else {
                // Tandai bahwa user mencoba booking
                isAttemptingBooking = true;
                showLoginRequiredModal();
            }
        });
    }
    
    if (closeModal) closeModal.addEventListener('click', closeBookingModal);
    if (closeCalendarModalBtn) closeCalendarModalBtn.addEventListener('click', closeCalendarModal);
    if (closeTimeSlotsModalBtn) closeTimeSlotsModalBtn.addEventListener('click', closeTimeSlotsModal);
    if (closeCheckoutModalBtn) closeCheckoutModalBtn.addEventListener('click', closeCheckoutModal);
    if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', () => {
        if (loginModal) {
            loginModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
    
    window.addEventListener('click', e => {
        if (e.target === modal) closeBookingModal();
        if (e.target === calendarModal) closeCalendarModal();
        if (e.target === timeSlotsModal) closeTimeSlotsModal();
        if (e.target === checkoutModal) closeCheckoutModal();
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
    
    // Buka modal login saat tombol login diklik
    if (iconGroup) {
        iconGroup.addEventListener('click', () => {
            if (loginModal) {
                loginModal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Proses login form
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateLoginForm()) {
                return;
            }
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            // Tampilkan loading state
            const submitButton = loginForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;
            
            // Panggil fungsi login
            const result = await login(email, password);
            
            // Kembalikan tombol ke state semula
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            
            if (result.success) {
                showFormMessage('loginForm', result.message, 'success');
                
                // Tunggu sebentar sebelum menutup modal
                setTimeout(() => {
                    if (loginModal) {
                        loginModal.style.display = 'none';
                        document.body.style.overflow = 'auto';
                    }
                }, 1500);
            } else {
                showFormMessage('loginForm', result.message, 'error');
            }
        });
    }
    
    // Filter riwayat
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active class
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Filter riwayat (implementasi filter)
            const filter = btn.getAttribute('data-filter');
            filterRiwayat(filter);
        });
    });
    
    function openCalendarModal(packageData) {
        selectedPackage = packageData;
        document.querySelector('#calendarModal .package-name').textContent = packageData.name;
        document.querySelector('#calendarModal .package-duration').textContent = packageData.duration;
        document.querySelector('#calendarModal .package-price').textContent = packageData.price;
        calendarModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        generateCalendar(new Date());
    }
    
    function closeCalendarModal() {
        if (calendarModal) {
            calendarModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
    
    function openTimeSlotsModal(date) {
        selectedDate = date;
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = date.toLocaleDateString('en-US', options);
        document.getElementById('selectedDateText').textContent = formattedDate;
        timeSlotsModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        generateTimeSlots();
    }
    
    function closeTimeSlotsModal() {
        if (timeSlotsModal) {
            timeSlotsModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
    
    function openCheckoutModal() {
        const checkoutModalElem = checkoutModal;
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = selectedDate.toLocaleDateString('en-US', options);
        document.getElementById('orderService').textContent = selectedPackage.name;
        document.getElementById('orderDate').textContent = formattedDate;
        document.getElementById('orderTime').textContent = selectedTimeSlot;
        const packageName = selectedPackage.name;
        const packageDuration = selectedPackage.duration;
        let price = 0;
        if (packagePrices[packageName] && packagePrices[packageName][packageDuration]) {
            price = packagePrices[packageName][packageDuration];
        }
        const formattedPrice = `IDR ${price.toLocaleString('id-ID')}.00`;
        document.getElementById('orderPrice').textContent = formattedPrice;
        document.getElementById('subtotal').textContent = formattedPrice;
        document.getElementById('tax').textContent = 'IDR 0.00';
        document.getElementById('total').textContent = formattedPrice;
        checkoutModalElem.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    function closeCheckoutModal() {
        if (checkoutModal) {
            checkoutModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
    
    // Event listener tombol pilih paket
    const selectButtons = document.querySelectorAll('.btn-select-package');
    selectButtons.forEach(button => {
        button.addEventListener('click', function () {
            const packageDetails = this.parentElement;
            const packageName = packageDetails.querySelector('.package-name').textContent;
            const packageDuration = packageDetails.querySelector('.package-duration').textContent;
            const packagePrice = packageDetails.querySelector('.package-price').textContent;
            const packageData = {
                name: packageName,
                duration: packageDuration,
                price: packagePrice
            };
            closeBookingModal();
            openCalendarModal(packageData);
        });
    });
    
    // Navigasi bulan kalender
    document.getElementById('prevMonth').addEventListener('click', async () => {
        const currentMonthText = document.getElementById('currentMonth').textContent;
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        const [monthName, year] = currentMonthText.split(' ');
        const monthIndex = monthNames.indexOf(monthName);
        const newDate = new Date(parseInt(year), monthIndex - 1, 1);
        generateCalendar(newDate);
    });
    
    document.getElementById('nextMonth').addEventListener('click', async () => {
        const currentMonthText = document.getElementById('currentMonth').textContent;
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        const [monthName, year] = currentMonthText.split(' ');
        const monthIndex = monthNames.indexOf(monthName);
        const newDate = new Date(parseInt(year), monthIndex + 1, 1);
        generateCalendar(newDate);
    });
    
    // Tombol Check Next Availability
    document.getElementById('checkAvailabilityBtn').addEventListener('click', () => {
      const selectedDay = document.querySelector('.calendar-day.selected');
      if (!selectedDay) {
          alert('Please select a date first.');
          return;
      }
      
      const currentMonthText = document.getElementById('currentMonth').textContent;
      const monthNames = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"];
      const [monthName, year] = currentMonthText.split(' ');
      const monthIndex = monthNames.indexOf(monthName);
      const day = parseInt(selectedDay.textContent);
      const date = new Date(parseInt(year), monthIndex, day);
      
      // Dapatkan tanggal hari ini untuk perbandingan
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
      date.setHours(0, 0, 0, 0); // Reset jam ke 00:00:00 untuk perbandingan tanggal saja
      
      // Cek apakah tanggal sudah lewat
      if (date < today) {
          alert('This date has passed. Please select a future date.');
      } else {
          closeCalendarModal();
          openTimeSlotsModal(date);
      }
    });
    
    // Tombol Back dan Next di modal time slots
    document.getElementById('backToCalendarBtn').addEventListener('click', () => {
        closeTimeSlotsModal();
        openCalendarModal(selectedPackage);
    });
    
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (!selectedTimeSlot) {
            alert('Please select a time slot first.');
            return;
        }
        
        closeTimeSlotsModal();
        openCheckoutModal();
    });
    
    // Form customer submit
    const customerForm = document.getElementById('customerForm');
    if (customerForm) {
        customerForm.addEventListener('submit', async e => {
            e.preventDefault();
            const customerName = document.getElementById('customerName').value.trim();
            const customerPhone = document.getElementById('customerPhone').value.trim();
            const customerEmail = document.getElementById('customerEmail').value.trim();
            const submitButton = customerForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;
            
            try {
                const result = await addBooking(
                    customerName,
                    customerEmail,
                    customerPhone,
                    selectedPackage.name,
                    selectedDate,
                    selectedTimeSlot
                );
                
                if (result.status === 'success') {
                    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                    const formattedDate = selectedDate.toLocaleDateString('en-US', options);
                    const packageName = selectedPackage.name;
                    const packageDuration = selectedPackage.duration;
                    let price = 0;
                    if (packagePrices[packageName] && packagePrices[packageName][packageDuration]) {
                        price = packagePrices[packageName][packageDuration];
                    }
                    const formattedPrice = `IDR ${price.toLocaleString('id-ID')}.00`;
                    const bookingId = `#BK${new Date().getTime().toString().slice(-8)}`;
                    
                    closeCheckoutModal();
                    showConfirmationPage({
                        bookingId: bookingId,
                        customerName: customerName,
                        customerPhone: customerPhone,
                        customerEmail: customerEmail,
                        packageName: packageName,
                        date: formattedDate,
                        time: selectedTimeSlot,
                        total: formattedPrice
                    });
                    
                    // Reset data dan form
                    selectedPackage = null;
                    selectedDate = null;
                    selectedTimeSlot = null;
                    customerForm.reset();
                } else {
                    alert(`Error: ${result.message}`);
                }
            } catch (error) {
                console.error('Error during booking:', error);
                alert('An error occurred during booking. Please try again.');
            } finally {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
        });
    }
    
    // Tampilkan halaman konfirmasi
    function showConfirmationPage(bookingData) {
        document.getElementById('bookingId').textContent = bookingData.bookingId;
        document.getElementById('customerNameConfirm').textContent = bookingData.customerName;
        document.getElementById('customerPhoneConfirm').textContent = bookingData.customerPhone;
        document.getElementById('customerEmailConfirm').textContent = bookingData.customerEmail;
        document.getElementById('packageConfirm').textContent = bookingData.packageName;
        document.getElementById('dateConfirm').textContent = bookingData.date;
        document.getElementById('timeConfirm').textContent = bookingData.time;
        document.getElementById('totalConfirm').textContent = bookingData.total;
        document.getElementById('confirmationPage').style.display = 'block';
        document.body.style.overflow = 'hidden';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Tombol Back to Home di halaman konfirmasi
    document.getElementById('backToHomeBtn').addEventListener('click', () => {
        document.getElementById('confirmationPage').style.display = 'none';
        document.body.style.overflow = 'auto';
        showInitialView();
    });
    
    // Tombol Print Booking
    document.getElementById('printBookingBtn').addEventListener('click', () => window.print());
    
    // Tutup halaman konfirmasi saat klik di luar konten
    window.addEventListener('click', e => {
        if (e.target === document.getElementById('confirmationPage')) {
            document.getElementById('confirmationPage').style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
    
    // Hover effect untuk service cards (scale + shadow)
    const serviceCards = document.querySelectorAll('.service-card');
    serviceCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-15px) scale(1.05)';
            card.style.boxShadow = '0 15px 30px rgba(147, 51, 234, 0.5)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
        });
    });
    
    // Hover effect untuk gallery items (rotate + scale)
    const galleryItems = document.querySelectorAll('.gallery-item');
    galleryItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-10px) rotate(3deg) scale(1.05)';
            item.style.boxShadow = '0 20px 40px rgba(249, 115, 22, 0.7)';
            item.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = '';
            item.style.boxShadow = '';
        });
    });
    
    // Testimonial carousel scroll snap (drag horizontal)
    const carousel = document.querySelector('.testimonial-carousel');
    if (carousel) {
        let isDown = false;
        let startX;
        let scrollLeft;
        
        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            carousel.classList.add('active');
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });
        
        carousel.addEventListener('mouseleave', () => {
            isDown = false;
            carousel.classList.remove('active');
        });
        
        carousel.addEventListener('mouseup', () => {
            isDown = false;
            carousel.classList.remove('active');
        });
        
        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2;
            carousel.scrollLeft = scrollLeft - walk;
        });
    }
    
    // Animate hero headline typing effect
    const headlinePurple = document.querySelector('.headline-purple');
    if (headlinePurple) {
        const text = headlinePurple.textContent;
        headlinePurple.textContent = '';
        let index = 0;
        const typingSpeed = 100;
        
        function type() {
            if (index < text.length) {
                headlinePurple.textContent += text.charAt(index);
                index++;
                setTimeout(type, typingSpeed);
            }
        }
        
        type();
    }
    
    // Language selector dropdown toggle (dummy example)
    const langSelector = document.querySelector('.language-selector');
    if (langSelector) {
        langSelector.addEventListener('click', () => {
            langSelector.classList.toggle('open');
        });
    }
    
    // Fungsionalitas Form Kontak mengirim ke WhatsApp
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', e => {
            e.preventDefault();
            const name = contactForm.querySelector('[name="name"]').value.trim();
            const email = contactForm.querySelector('[name="email"]').value.trim();
            const message = contactForm.querySelector('[name="message"]').value.trim();
            const phoneNumber = '628111828892';
            const textMessage = `Halo C-Pro Music Studio, saya ingin bertanya tentang layanan Anda.\n\nNama: ${name}\nEmail: ${email}\nPesan: ${message}`;
            const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(textMessage)}`;
            window.open(whatsappUrl, '_blank');
        });
    }
});

// Hamburger toggle
const hamburger = document.querySelector('.hamburger-menu');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
  navMenu.classList.toggle('active');
  hamburger.classList.toggle('active'); // kalau mau animasi ikon berubah
});

// Tutup menu otomatis setelah klik link (opsional)
document.querySelectorAll('.nav-menu a').forEach(link =>
  link.addEventListener('click', () => {
    navMenu.classList.remove('active');
    hamburger.classList.remove('active');
  })
);

// Modal Detail Tiket
const ticketDetailModal = document.getElementById('ticketDetailModal');
const closeTicketModalBtn = document.querySelector('.close-ticket-modal');
const printTicketBtn = document.getElementById('printTicketBtn');
const downloadTicketBtn = document.getElementById('downloadTicketBtn');
const closeTicketModal = document.getElementById('closeTicketModalBtn');

// Fungsi untuk menampilkan detail tiket
function showTicketDetail(bookingData) {
    // Isi data tiket
    document.getElementById('ticketBookingId').textContent = bookingData.id;
    document.getElementById('ticketPackageName').textContent = bookingData.packageName;
    document.getElementById('ticketDate').textContent = bookingData.date;
    document.getElementById('ticketTime').textContent = bookingData.time;
    document.getElementById('ticketDuration').textContent = bookingData.duration;
    document.getElementById('ticketTotal').textContent = bookingData.total;
    
    // Tampilkan modal
    ticketDetailModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Fungsi untuk menutup modal detail tiket
function closeTicketDetailModal() {
    ticketDetailModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Event listener untuk tombol close
if (closeTicketModalBtn) {
    closeTicketModalBtn.addEventListener('click', closeTicketDetailModal);
}

if (closeTicketModal) {
    closeTicketModal.addEventListener('click', closeTicketDetailModal);
}

// Event listener untuk print tiket
if (printTicketBtn) {
    printTicketBtn.addEventListener('click', () => {
        window.print();
    });
}

// Event listener untuk download tiket
if (downloadTicketBtn) {
    downloadTicketBtn.addEventListener('click', () => {
        // Simulasi download - dalam implementasi nyata, ini akan menghasilkan PDF
        alert('Fitur download tiket akan segera tersedia. Silakan gunakan tombol Print untuk mencetak tiket Anda.');
    });
}

// Tutup modal saat klik di luar
window.addEventListener('click', (e) => {
    if (e.target === ticketDetailModal) {
        closeTicketDetailModal();
    }
});

// Modifikasi fungsi loadRiwayatPembelian untuk menambahkan event listener
async function loadRiwayatPembelian() {
    const riwayatList = document.getElementById('riwayatList');
    if (!riwayatList) return;
    
    // Kosongkan daftar riwayat
    riwayatList.innerHTML = '<p class="loading">Memuat riwayat pembelian...</p>';
    
    try {
        // Ambil data riwayat dari backend
        const response = await fetch(`${API_URL}?action=getUserBookings&userId=${currentUser.id}`);
        const data = await response.json();
        
        riwayatList.innerHTML = '';
        
        if (data.status === 'success' && data.bookings.length > 0) {
            // Tampilkan riwayat pembelian
            data.bookings.forEach(item => {
                const riwayatCard = document.createElement('div');
                riwayatCard.className = 'riwayat-card';
                riwayatCard.innerHTML = `
                    <div class="riwayat-card-header">
                        <h3 class="riwayat-card-title">${item.packageName}</h3>
                        <span class="riwayat-card-status ${item.status === 'completed' ? 'status-completed' : 'status-upcoming'}">
                            ${item.status === 'completed' ? 'Selesai' : 'Akan Datang'}
                        </span>
                    </div>
                    <div class="riwayat-card-details">
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Tanggal:</span>
                            <span class="riwayat-card-detail-value">${item.date}</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Waktu:</span>
                            <span class="riwayat-card-detail-value">${item.time}</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Total:</span>
                            <span class="riwayat-card-detail-value">IDR ${parseInt(item.total).toLocaleString('id-ID')}.00</span>
                        </div>
                        <div class="riwayat-card-detail">
                            <span class="riwayat-card-detail-label">Booking ID:</span>
                            <span class="riwayat-card-detail-value">${item.id}</span>
                        </div>
                    </div>
                    <div class="riwayat-card-actions">
                        <button class="riwayat-card-btn btn-view">Lihat Detail</button>
                        <button class="riwayat-card-btn btn-download">Download Tiket</button>
                    </div>
                `;
                riwayatList.appendChild(riwayatCard);
                
                // Tambahkan event listener untuk tombol Lihat Detail
                const viewBtn = riwayatCard.querySelector('.btn-view');
                viewBtn.addEventListener('click', () => {
                    showTicketDetail(item);
                });
                
                // Tambahkan event listener untuk tombol Download Tiket
                const downloadBtn = riwayatCard.querySelector('.btn-download');
                downloadBtn.addEventListener('click', () => {
                    showTicketDetail(item);
                    // Fokus ke tombol download setelah modal terbuka
                    setTimeout(() => {
                        if (downloadTicketBtn) {
                            downloadTicketBtn.focus();
                        }
                    }, 100);
                });
            });
        } else {
            riwayatList.innerHTML = '<p class="no-riwayat">Belum ada riwayat pembelian</p>';
        }
    } catch (error) {
        console.error('Error loading riwayat:', error);
        riwayatList.innerHTML = '<p class="error-riwayat">Gagal memuat riwayat pembelian</p>';
    }
}

// Fungsi untuk generate QR Code
function generateQRCode(bookingData) {
    // Hapus QR Code yang sudah ada
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    // Buat data untuk QR Code
    const qrData = {
        bookingId: bookingData.id,
        packageName: bookingData.packageName,
        date: bookingData.date,
        time: bookingData.time,
        customerName: currentUser.name,
        customerEmail: currentUser.email
    };
    
    // Generate QR Code
    new QRCode(qrContainer, {
        text: JSON.stringify(qrData),
        width: 150,
        height: 150,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

// Perbarui fungsi showTicketDetail
function showTicketDetail(bookingData) {
    // Isi data tiket
    document.getElementById('ticketBookingId').textContent = bookingData.id;
    document.getElementById('ticketPackageName').textContent = bookingData.packageName;
    document.getElementById('ticketDate').textContent = bookingData.date;
    document.getElementById('ticketTime').textContent = bookingData.time;
    
    // Ekstrak durasi dari nama paket (misal: "Thr. Jorn Session (1 hr)")
    const durationMatch = bookingData.packageName.match(/\(([^)]+)\)/);
    const duration = durationMatch ? durationMatch[1] : '-';
    document.getElementById('ticketDuration').textContent = duration;
    
    document.getElementById('ticketTotal').textContent = `IDR ${parseInt(bookingData.total).toLocaleString('id-ID')}.00`;
    
    // Generate QR Code
    generateQRCode(bookingData);
    
    // Tampilkan modal
    ticketDetailModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Fungsi untuk download QR Code sebagai gambar
function downloadQRCode(bookingData) {
    // Dapatkan canvas QR Code
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    
    // Buat link download
    const link = document.createElement('a');
    link.download = `tiket-${bookingData.id}.png`;
    link.href = canvas.toDataURL('image/png');
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Tampilkan notifikasi
    showNotification('QR Code berhasil diunduh!', 'success');
}

// Fungsi untuk menampilkan notifikasi
function showNotification(message, type = 'info') {
    // Buat elemen notifikasi
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close">&times;</button>
    `;
    
    // Tambahkan ke body
    document.body.appendChild(notification);
    
    // Tambahkan event listener untuk tombol close
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    });
    
    // Hapus otomatis setelah 3 detik
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }
    }, 3000);
}

// Perbarui event listener untuk tombol download
if (downloadTicketBtn) {
    downloadTicketBtn.addEventListener('click', () => {
        // Dapatkan data booking yang sedang ditampilkan
        const bookingId = document.getElementById('ticketBookingId').textContent;
        const bookingData = {
            id: bookingId,
            packageName: document.getElementById('ticketPackageName').textContent,
            date: document.getElementById('ticketDate').textContent,
            time: document.getElementById('ticketTime').textContent,
            total: document.getElementById('ticketTotal').textContent.replace(/[^0-9]/g, '')
        };
        
        // Download QR Code
        downloadQRCode(bookingData);
    });
}




