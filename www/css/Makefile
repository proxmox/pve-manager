include ../../defines.mk

all:

.PHONY: install 
install: ext6-pve.css font-awesome.css
	install -d ${WWWCSSDIR}
	install -m 0644 -o www-data -g www-data $? ${WWWCSSDIR}
	set -e && ${MAKE} -C fonts install

.PHONY: clean
clean:
	rm -rf *~
