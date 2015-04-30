pveproxy with ExtJS 5 developpement mini howto
==============================================

unpack the ExtJS 5 sources, and copy them to /usr/share/pve-manager/ext5

    cd www/ext5/
    make install

symlink the to our ext5 compatible javascript code

    cd /usr/share/pve-manager
    ln -s PATH_TO_YOUR_GIT_REPO/www/manager5

access the PVE proxy with ExtJS 5

    https://localhost:8006/?ext5=1


With the extra parameter **ext5=1**, pve-proxy will call the function **PVE::ExtJSIndex5::get_index()**
which returns a HTML page, with all javascript files included.
Provided you included the javascript in **PVE/ExtJSIndex5.pm**, a simple browser refresh is then enough 
to see your changes.
