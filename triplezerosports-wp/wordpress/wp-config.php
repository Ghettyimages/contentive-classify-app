<?php
/**
 * The base configuration for WordPress
 */

// ** Database settings - You can get this info from your web host ** //
define( 'DB_NAME', 'triplezerosports_db' );
define( 'DB_USER', 'your_siteground_db_user' );
define( 'DB_PASSWORD', 'your_siteground_db_password' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 */
define('AUTH_KEY',         '=<Xry8^Jrcje>2{94YGRR x,:}uQ.ZOEYQ9eb[5c0Fl_!iMKT2*Ty^Ak}E,wNK-P');
define('SECURE_AUTH_KEY',  'iqN^JqlVNUN4FfftafO%Qok+5!E_:@`:H-ZrILarJNfU4*,-o-3t&0O(ttrV~#nm');
define('LOGGED_IN_KEY',    '1RcXA^|+P {yNV(2~+_mOUMj$g xL*JNn[$Ydw|yfD-9G7s^[rJGwXAr~{7|o0L^');
define('NONCE_KEY',        'oMi>&Q2y!W,@(fCgmm+6>Rft+*+PHZ72s_N$6l {#0Eah1/ v4`S|}87/R}^|iC ');
define('AUTH_SALT',        'K3?EK^:N2w-8STo*#OBXoi@i]sw?~}5SqS H,bYv~ZE}jjlBHXSVl8!g7+$j{9[4');
define('SECURE_AUTH_SALT', 'W&9ToQod>`}7{>6jr+G-b+]W+_hQ*~[pO:%XXSp{3j~5ZS|>3dTXI=r)!ytlK?mY');
define('LOGGED_IN_SALT',   'uA;?4zecK+|d20r-6sR3v;*hH~B++?8XOdijZ$eU>+%)fS<1X,:+_vB<l,DB_2[e');
define('NONCE_SALT',       '*(p6It#WM];.D# S]**/396JNp~*-Q DkT0JPSORteME5ZJ0d-&P7N8aIwYRL3fj');

$table_prefix = 'tz_';

define( 'WP_DEBUG', false );

// Performance optimizations
define('WP_MEMORY_LIMIT', '256M');
define( 'WP_AUTO_UPDATE_CORE', true );

// Site URLs
define('WP_HOME','https://triplezerosports.com');
define('WP_SITEURL','https://triplezerosports.com');

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

require_once ABSPATH . 'wp-settings.php';
