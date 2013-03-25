/* see 'man perlsec'
 *
 */ 
#include <unistd.h>
#include <stdio.h>

#define REAL_PATH "/usr/bin/pvemailforward.pl"

int main(ac, av)
char **av;
{
    execv(REAL_PATH, av);
 
    fprintf(stderr, "exec '%s' failed\n", REAL_PATH);

    return -1;
}
