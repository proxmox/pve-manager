/* see 'man perlsec'
 *
 */ 
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>

#define REAL_PATH "/usr/bin/pvemailforward.pl"

int main(int argc, char **argv)
{
    execv(REAL_PATH, argv);
 
    fprintf(stderr, "exec '%s' failed\n", REAL_PATH);

    exit(-1);
}
