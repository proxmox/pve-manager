package PVE::NoVncIndex;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console) = @_;

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
<head>
    <title>Proxmox Console</title>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <!-- Apple iOS Safari settings -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <!-- Stylesheets -->
    <link rel="stylesheet" href="/novnc/include/base.css"/>
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    $page .= <<_EOD;
    <script type="text/javascript">
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username';
PVE.CSRFPreventionToken = '$csrftoken';
INCLUDE_URI='/novnc/include/';
    </script>
</head>
<body>
  <div id="noVNC-control-bar">
    <!--noVNC Mobile Device only Buttons-->
    <div class="noVNC-buttons-left">
      <input type="image" alt="viewport drag" src="/novnc/images/drag.png"
             id="noVNC_view_drag_button" class="noVNC_status_button"
             title="Move/Drag Viewport">
      <div id="noVNC_mobile_buttons">
        <input type="image" alt="No mousebutton" src="/novnc/images/mouse_none.png"
               id="noVNC_mouse_button0" class="noVNC_status_button">
        <input type="image" alt="Left mousebutton" src="/novnc/images/mouse_left.png"
               id="noVNC_mouse_button1" class="noVNC_status_button">
        <input type="image" alt="Middle mousebutton" src="/novnc/images/mouse_middle.png"
               id="noVNC_mouse_button2" class="noVNC_status_button">
        <input type="image" alt="Right mousebutton" src="/novnc/images/mouse_right.png"
               id="noVNC_mouse_button4" class="noVNC_status_button">
        <input type="image" alt="Keyboard" src="/novnc/images/keyboard.png"
               id="showKeyboard" class="noVNC_status_button"
               value="Keyboard" title="Show Keyboard"/>
        <!-- Note that Google Chrome on Android doesn't respect any of these,
             html attributes which attempt to disable text suggestions on the
             on-screen keyboard. Let's hope Chrome implements the ime-mode
             style for example -->
        <textarea id="keyboardinput" autocapitalize="off"
                  autocorrect="off" autocomplete="off" spellcheck="false"
                  mozactionhint="Enter" onsubmit="return false;"
                  style="ime-mode: disabled;"></textarea>
        <div id="noVNC_extra_keys">
          <input type="image" alt="Extra keys" src="/novnc/images/showextrakeys.png"
                 id="showExtraKeysButton" class="noVNC_status_button">
          <input type="image" alt="Ctrl" src="/novnc/images/ctrl.png"
                 id="toggleCtrlButton" class="noVNC_status_button">
          <input type="image" alt="Alt" src="/novnc/images/alt.png"
                 id="toggleAltButton" class="noVNC_status_button">
          <input type="image" alt="Tab" src="/novnc/images/tab.png"
                 id="sendTabButton" class="noVNC_status_button">
          <input type="image" alt="Esc" src="/novnc/images/esc.png"
                 id="sendEscButton" class="noVNC_status_button">
	  <input type="image" alt="Ctrl+Alt+Del" src="/novnc/images/ctrlaltdel.png"
		 id="sendCtrlAltDelButton" class="noVNC_status_button">
        </div>
      </div>
    </div>

    <div id="noVNC_status">Loading</div>

    <!--noVNC Buttons-->
    <div class="noVNC-buttons-right">
      <input type="image" alt="Send keys" src="/novnc/images/showextrakeys.png"
             id="showSendKeysButton" class="noVNC_status_button"
	     title="Send keys" />
      <input type="image" alt="Clipboard" src="/novnc/images/clipboard.png"
             id="clipboardButton" class="noVNC_status_button"
             title="Clipboard" />
      <input type="image" alt="Commands" src="/novnc/images/power.png"
             id="pveCommandsButton" class="noVNC_status_button"
             title="Commands" />
    </div>

    <div id="noVNC_description" class="">
    </div>

    <!-- Popup Status Panel -->
    <div id="noVNC_popup_status_panel" class="">
    </div>

    <!-- Clipboard Panel -->
    <div id="noVNC_clipboard" class="triangle-right top">
      <textarea id="noVNC_clipboard_text" rows=5>
      </textarea>
      <br />
      <input id="noVNC_clipboard_clear_button" type="button"
             value="Clear">
    </div>
      
    <!-- PVE command Panel -->
    <div id="noVNC_pve_commands" class="triangle-right top">
      <span id="noVNC_pve_command_menu">
        <input type="button" id="pveStartButton" value="Start" />
	<input type="button" id="pveShutdownButton" value="Shutdown" />
 	<input type="button" id="pveStopButton" value="Stop" />
 	<input type="button" id="pveResetButton" value="Reset" />
	<input type="button" id="pveSuspendButton" value="Suspend" />
 	<input type="button" id="pveResumeButton" value="Resume" />
        <input type="button" id="pveReloadButton" value="Reload" />
      </span>
    </div>

    <!-- Settings Panel -->
    <div id="noVNC_settings" class="triangle-right top">
      <span id="noVNC_settings_menu">
        <ul>
          <li><input id="noVNC_encrypt" type="checkbox"> Encrypt</li>
          <li><input id="noVNC_true_color" type="checkbox" checked> True Color</li>
          <li><input id="noVNC_cursor" type="checkbox"> Local Cursor</li>
          <li><input id="noVNC_clip" type="checkbox" value="true"> Clip to Window</li>
          <li><input id="noVNC_shared" type="checkbox"> Shared Mode</li>
          <li><input id="noVNC_view_only" type="checkbox"> View Only</li>
          <li><input id="noVNC_path" type="input" value="websockify"> Path</li>
          <li><input id="noVNC_repeaterID" type="input" value=""> Repeater ID</li>
          <li><input id="noVNC_stylesheet" type="input" value=""> Stylesheet</li>
          <li><input id="noVNC_logging" type="input" value=""> Logging</li>

         </ul>
      </span>
    </div>

    <!-- PVE Send Key Panel -->
    <div id="noVNC_send_keys" class="triangle-right top">
      <span id="noVNC_send_keys_panel">
      </span>
    </div>

    <!-- Connection Panel -->
    <div id="noVNC_controls" class="triangle-right top">
      <ul>
        <li><label><strong>Host: </strong><input id="noVNC_host" /></label></li>
        <li><label><strong>Port: </strong><input id="noVNC_port" /></label></li>
        <li><label><strong>Password: </strong><input id="noVNC_password" type="password" /></label></li>
        <li><input id="noVNC_connect_button" type="button" value="Connect"></li>
      </ul>
    </div>
	  
  </div> <!-- End of noVNC-control-bar -->

  <div id="noVNC_screen">
    <div id="noVNC_screen_pad"></div>

    <h1 id="noVNC_logo"><span>no</span><br />VNC</h1>

    <!-- HTML5 Canvas -->
    <div id="noVNC_container">
      <canvas id="noVNC_canvas" width="640px" height="20px">
        Canvas not supported.
      </canvas>
    </div>

  </div>
  <script src="/novnc/include/util.js"></script>
  <script src="/novnc/include/pveui.js"></script>
</body>
</html>
_EOD
   
    return $page;
}

1;
