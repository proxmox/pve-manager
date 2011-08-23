#!/bin/sh

# Refresh GNU autotools toolchain.
for i in config.guess config.sub missing install-sh mkinstalldirs ; do
	test -r /usr/share/automake-1.9/${i} && {
		rm -f ${i}
		cp /usr/share/automake-1.9/${i} .
	}
	chmod 755 ${i}
done

aclocal
#aclocal -I m4
#aclocal -I cmulocal
#autoheader
automake --foreign --add-missing
autoconf

exit 0
