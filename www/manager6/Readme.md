pveproxy with ExtJS 6 developpement mini howto
==============================================

unpack the ExtJS 6 sources, and copy them to /usr/share/pve-manager/ext6

    cd www/ext6/
    make install

symlink the ext6 dir in pve-manager to the manager5 directory

    cd /usr/share/pve-manager
    ln -s PATH_TO_YOUR_GIT_REPO/www/manager6

restart pveproxy

    systemctl pveproxy restart

access the PVE proxy with ExtJS 6

    https://localhost:8006/?ext6=1


With the extra parameter **ext6=1**, pve-proxy will call the function **PVE::ExtJSIndex6::get_index()**
which returns a HTML page, with all javascript symlinked from your git repository.
Provided you included the javascript files in **PVE/ExtJSIndex6.pm**, after editing a file in the git repository, a simple refresh is enough to see your changes in the browser.
